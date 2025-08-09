require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const CryptoJS = require('crypto-js');
const pinataSDK = require('@pinata/sdk');
const path = require('path');
const { mintNFTWithIPFS } = require('./utils/nftContract');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Add connection status endpoint
// Create express routes
app.get('/', (req, res) => {
  res.json({ message: 'API working' });
});

app.get('/healthcheck', async (req, res) => {
  try {
    // Check MongoDB connection
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    // Check environment variables
    const envVars = {
      mongodb: process.env.MONGODB_URI ? 'configured' : 'missing',
      pinata: process.env.PINATA_API_KEY ? 'configured' : 'missing',
      nftContract: process.env.NFT_CONTRACT_ADDRESS ? 'configured' : 'missing',
      rpcUrl: process.env.SEPOLIA_RPC_URL ? 'configured' : 'missing',
      privateKey: process.env.PRIVATE_KEY ? 'configured' : 'missing'
    };
    
    res.json({
      status: 'healthy',
      version: '1.0',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      environment: envVars
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Convert DataJson to ContractData
app.post('/api/convert-datajson-to-contract', async (req, res) => {
  try {
    const { dataJsonId } = req.body;
    
    if (!dataJsonId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing dataJsonId in request body' 
      });
    }
    
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB not connected'
      });
    }
    
    // Find the DataJson entry
    const dataJsonEntry = await DataJson.findById(dataJsonId);
    
    if (!dataJsonEntry) {
      return res.status(404).json({
        success: false,
        error: `DataJson with ID ${dataJsonId} not found`
      });
    }
    
    // Extract the data and pin it to IPFS
    const ipfsResult = await pinJSONToIPFS(dataJsonEntry.data, 'contract-data-from-datajson-' + Date.now());
    
    // Create and save the ContractData entry
    const contractEntry = new ContractData({
      data: dataJsonEntry.data,
      ...(ipfsResult || {}),
      timestamp: new Date()
    });
    
    const savedEntry = await contractEntry.save();
    
    res.status(200).json({
      success: true,
      contractData: {
        id: savedEntry._id,
        ipfsHash: ipfsResult ? ipfsResult.ipfsHash : null,
        pinataUrl: ipfsResult ? ipfsResult.pinataUrl : null,
        timestamp: savedEntry.timestamp
      },
      originalDataJsonId: dataJsonId
    });
  } catch (error) {
    console.error('Error converting DataJson to ContractData:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to convert DataJson to ContractData' 
    });
  }
});

// Add simple diagnostic endpoint
app.get('/mongo-status', (req, res) => {
  const status = {
    mongooseState: mongoose.connection.readyState,
    stateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown'
  };
  
  res.status(200).json(status);
});

// Schemas and Models
const DataJsonSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
  timestamp: {
    type: Date,
    default: Date.now
  }
});
const DetailJsonSchema = new mongoose.Schema({
  detail: mongoose.Schema.Types.Mixed,
  ipfsHash: String,
  pinataUrl: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});
const ContractDataSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
  ipfsHash: String,
  pinataUrl: String,
  timestamp: {
    type: Date,
    default: Date.now
  },
  nftData: {
    tokenId: String,
    recipientAddress: String,
    txHash: String,
    mintedAt: {
      type: Date,
      default: Date.now
    }
  }
});

const DataJson = mongoose.model('DataJson', DataJsonSchema);
const DetailJson = mongoose.model('DetailJson', DetailJsonSchema);
const ContractData = mongoose.model('ContractData', ContractDataSchema);

// Initialize Pinata client
let pinata = null;
try {
  if (process.env.PINATA_API_KEY && process.env.PINATA_SECRET_KEY) {
    pinata = new pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_KEY);
    console.log('Pinata client initialized');
  } else {
    console.log('Pinata API keys not configured');
  }
} catch (error) {
  console.error('Error initializing Pinata client:', error);
}

// Function to pin JSON to IPFS via Pinata
const pinJSONToIPFS = async (jsonData, name) => {
  if (!pinata) {
    console.log('Pinata client not available, skipping IPFS upload');
    return null;
  }

  try {
    const options = {
      pinataMetadata: {
        name: name || 'ava-backend-data-' + Date.now()
      }
    };
    
    const result = await pinata.pinJSONToIPFS(jsonData, options);
    console.log('Successfully pinned to IPFS:', result.IpfsHash);
    return {
      ipfsHash: result.IpfsHash,
      pinataUrl: `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`,
      timestamp: new Date()
    };
  } catch (error) {
    console.error('Error pinning to IPFS:', error);
    return null; // Return null instead of throwing error
  }
};

// Connect to MongoDB with a connection timeout
let mongoConnected = false;
const connectWithTimeout = () => {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('MongoDB connection timeout')), 5000)
  );
  
  const connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  }).then(() => {
    console.log('MongoDB connected');
    mongoConnected = true;
  });
  
  return Promise.race([connectionPromise, timeoutPromise]).catch(err => {
    console.log('MongoDB connection error:', err.message);
    mongoConnected = false;
  });
};

// Not needed anymore - functionality is now in the endpoint directly

// Try to connect to MongoDB, but don't block server startup
connectWithTimeout();

// Endpoints
app.post('/datajson', async (req, res) => {
  try {
    const data = req.body;
    let savedData = null;
    
    // Do NOT pin to IPFS for datajson endpoint per requirement
    
    // Try to save to MongoDB if connected
    if (mongoConnected) {
      try {
        const dataEntry = new DataJson({
          data,
          timestamp: new Date() // Just include timestamp
        });
        savedData = await dataEntry.save();
      } catch (dbErr) {
        console.error('Database error:', dbErr.message);
      }
    }
    
    return res.status(200).json({
      message: 'Request received',
      received: data,
      saved: savedData ? true : false,
      id: savedData?._id || null,
      mongoStatus: mongoConnected ? 1 : 0
    });
  } catch (err) {
    console.error('Error in datajson endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/detailjson', async (req, res) => {
  try {
    const detail = req.body;
    let ipfsResult = null;
    let savedData = null;
    
    // Try to pin to IPFS
    ipfsResult = await pinJSONToIPFS(detail, 'ava-detail-' + Date.now());
    
    // Try to save to MongoDB if connected
    if (mongoConnected) {
      try {
        const detailEntry = new DetailJson({
          detail,
          ...(ipfsResult || {})
        });
        savedData = await detailEntry.save();
      } catch (dbErr) {
        console.error('Database error:', dbErr.message);
      }
    }
    
    return res.status(200).json({
      message: 'Request received',
      received: detail,
      ipfs: ipfsResult,
      saved: savedData ? true : false,
      id: savedData?._id || null,
      mongoStatus: mongoConnected ? 1 : 0
    });
  } catch (err) {
    console.error('Error in detailjson endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

// Contract data endpoint
app.post('/contract-data', async (req, res) => {
  try {
    // First check if there's any dataJson reference
    const { dataJsonId, ...otherData } = req.body;
    let dataJsonContent = null;
    
    // If dataJsonId is provided, try to fetch that data from MongoDB
    if (dataJsonId && mongoConnected) {
      try {
        const dataJsonEntry = await DataJson.findById(dataJsonId);
        if (dataJsonEntry) {
          dataJsonContent = dataJsonEntry.data;
        } else {
          console.log(`No DataJson found with id ${dataJsonId}`);
        }
      } catch (err) {
        console.error('Error fetching DataJson:', err.message);
      }
    }
    
    // Combine dataJsonContent with other data or use just the request body
    const data = dataJsonContent ? { ...otherData, dataJsonContent } : req.body;
    
    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Data is required' });
    }
    
    // Pin the data to IPFS
    const ipfsResult = await pinJSONToIPFS(data, 'contract-data-' + Date.now());
    
    // Create contract data entry even if IPFS pinning failed
    const contractEntry = {
      data,
      ...(ipfsResult || {})
    };
    
    // Try to save if MongoDB is connected
    let saved = false;
    let id = null;
    if (mongoConnected) {
      try {
        const savedEntry = await new ContractData(contractEntry).save();
        if (savedEntry) {
          saved = true;
          id = savedEntry._id;
        }
      } catch (dbErr) {
        console.error('Database error:', dbErr.message);
      }
    }
    
    return res.status(201).json({
      message: 'Contract data processed',
      data,
      ipfs: ipfsResult,
      saved,
      id,
      mongoStatus: mongoConnected ? 1 : 0
    });
    
  } catch (err) {
    console.error('Error in contract-data endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/datajson', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(200).json({
        message: 'MongoDB not connected',
        data: [],
        mongoStatus: 0
      });
    }
    
    const data = await DataJson.find().sort({ timestamp: -1 }).limit(10);
    
    return res.status(200).json({
      data,
      count: data.length,
      mongoStatus: 1
    });
    
  } catch (err) {
    console.error('Error retrieving data:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/detailjson', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(200).json({
        message: 'MongoDB not connected',
        details: [],
        mongoStatus: 0
      });
    }
    
    const details = await DetailJson.find().sort({ timestamp: -1 }).limit(10);
    
    return res.status(200).json({
      details,
      count: details.length,
      mongoStatus: 1
    });
    
  } catch (err) {
    console.error('Error retrieving details:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/contract-data', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(200).json({
        message: 'MongoDB not connected',
        contractData: [],
        mongoStatus: 0
      });
    }
    
    const contractData = await ContractData.find().sort({ timestamp: -1 }).limit(10);
    
    return res.status(200).json({
      contractData,
      count: contractData.length,
      mongoStatus: 1
    });
    
  } catch (err) {
    console.error('Error retrieving contract data:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

// Endpoint to mint an NFT from an IPFS hash
app.post('/mint-nft', async (req, res) => {
  try {
    const { recipientAddress, ipfsHash } = req.body;
    
    if (!recipientAddress) {
      return res.status(400).json({
        success: false,
        error: 'Recipient Ethereum address is required'
      });
    }
    
    if (!ipfsHash) {
      return res.status(400).json({
        success: false,
        error: 'IPFS hash is required'
      });
    }
    
    console.log(`Minting NFT to ${recipientAddress} with IPFS hash: ${ipfsHash}`);
    
    // Format IPFS hash for MetaMask compatibility
    let formattedIpfsHash = ipfsHash;
    if (!formattedIpfsHash.startsWith('ipfs://')) {
      formattedIpfsHash = `ipfs://${ipfsHash}`;
    }
    
    // Mint the NFT using the contract utility
    const result = await mintNFTWithIPFS(recipientAddress, formattedIpfsHash);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Error minting NFT:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to mint NFT'
    });
  }
});

// Endpoint to get NFT details by token ID
app.get('/nft/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    
    if (!tokenId) {
      return res.status(400).json({
        success: false,
        error: 'Token ID is required'
      });
    }
    
    // Set ENABLE_MOCK_DATA in the environment for testing
    if (process.env.NODE_ENV !== 'production' && !process.env.ENABLE_MOCK_DATA) {
      process.env.ENABLE_MOCK_DATA = 'true';
    }
    
    const { getNFTDetails } = require('./utils/nftContract');
    const nftDetails = await getNFTDetails(tokenId);
    
    if (!nftDetails) {
      return res.status(404).json({
        success: false,
        error: `NFT with token ID ${tokenId} not found`
      });
    }
    
    // Add MetaMask import instructions
    const contractAddress = nftDetails.contractAddress;
    nftDetails.metamaskInfo = {
      addToMetamask: `To add this NFT to MetaMask, follow these steps:
      1. Open MetaMask and click on the 'NFTs' tab
      2. Click 'Import NFT'
      3. Enter the Contract Address: ${contractAddress}
      4. Enter the Token ID: ${tokenId}
      5. Click 'Import'`,
      networkInfo: `Make sure your MetaMask is connected to the Sepolia Test Network`,
      contractAddress: contractAddress,
      tokenId: tokenId,
      openseaUrl: `https://testnets.opensea.io/assets/sepolia/${contractAddress}/${tokenId}`,
      importUrl: `https://ava-backend-sepia.vercel.app/add-nft/sepolia/${contractAddress}/${tokenId}`
    };
    
    res.status(200).json({
      success: true,
      nft: nftDetails
    });
  } catch (error) {
    console.error('Error getting NFT details:', error);
    
    // Provide mock data if in development/test mode
    if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_MOCK_DATA === 'true') {
      const contractAddress = process.env.NFT_CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3';
      const tokenId = req.params.tokenId;
      
      const mockNft = {
        tokenId: tokenId,
        owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        tokenURI: `ipfs://QmfZbzUHa9cPExnJWn8qEaPU3nA9CT5V2ZAv8Wk37tLugQ`,
        contractAddress: contractAddress,
        metamaskInfo: {
          addToMetamask: `To add this NFT to MetaMask, follow these steps:
          1. Open MetaMask and click on the 'NFTs' tab
          2. Click 'Import NFT'
          3. Enter the Contract Address: ${contractAddress}
          4. Enter the Token ID: ${tokenId}
          5. Click 'Import'`,
          networkInfo: `Make sure your MetaMask is connected to the Sepolia Test Network`,
          contractAddress: contractAddress,
          tokenId: tokenId,
          openseaUrl: `https://testnets.opensea.io/assets/sepolia/${contractAddress}/${tokenId}`,
          importUrl: `https://ava-backend-sepia.vercel.app/add-nft/sepolia/${contractAddress}/${tokenId}`
        }
      };
      
      return res.status(200).json({
        success: true,
        nft: mockNft,
        isMockData: true
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get NFT details'
    });
  }
});

app.post('/mint-nft-from-datajson', async (req, res) => {
  try {
    const { dataJsonId, recipientAddress } = req.body;
    
    if (!dataJsonId) {
      return res.status(400).json({
        success: false,
        error: 'DataJson ID is required'
      });
    }
    
    if (!recipientAddress) {
      return res.status(400).json({
        success: false,
        error: 'Recipient Ethereum address is required'
      });
    }
    
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB not connected',
        mongoStatus: 0
      });
    }
    
    // Find the DataJson entry
    const dataJsonEntry = await DataJson.findById(dataJsonId);
    
    if (!dataJsonEntry) {
      return res.status(404).json({
        success: false,
        error: `DataJson with ID ${dataJsonId} not found`
      });
    }
    
    // Pin to IPFS first (this creates a ContractData entry as well)
    const ipfsResult = await pinJSONToIPFS(dataJsonEntry.data, 'nft-data-from-datajson-' + Date.now());
    
    if (!ipfsResult || !ipfsResult.ipfsHash) {
      return res.status(500).json({
        success: false,
        error: 'Failed to pin data to IPFS'
      });
    }
    
    // Format IPFS hash for MetaMask compatibility
    let formattedIpfsHash = ipfsResult.ipfsHash;
    if (!formattedIpfsHash.startsWith('ipfs://')) {
      formattedIpfsHash = `ipfs://${ipfsResult.ipfsHash}`;
      console.log(`Formatted IPFS hash to: ${formattedIpfsHash}`);
    }
    
    // Mint the NFT with the formatted IPFS hash
    const mintResult = await mintNFTWithIPFS(recipientAddress, formattedIpfsHash);
    
    if (mintResult.success) {
      // Save the contract data
      const contractEntry = new ContractData({
        data: dataJsonEntry.data,
        ...ipfsResult,
        nftData: {
          tokenId: mintResult.tokenId,
          recipientAddress: recipientAddress,
          txHash: mintResult.txHash,
        }
      });
      
      await contractEntry.save();
      
      res.status(200).json({
        success: true,
        nft: mintResult,
        ipfs: ipfsResult,
        originalDataJsonId: dataJsonId
      });
    } else {
      res.status(500).json({
        success: false,
        error: mintResult.error || 'Failed to mint NFT',
        ipfs: ipfsResult
      });
    }
  } catch (error) {
    console.error('Error in mint-nft-from-datajson endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to mint NFT from DataJson'
    });
  }
});

// Endpoint to provide a user-friendly page to import NFTs to MetaMask
app.get('/import-nft/:contractAddress/:tokenId', async (req, res) => {
  try {
    const { contractAddress, tokenId } = req.params;
    
    if (!contractAddress || !tokenId) {
      return res.status(400).send('Contract address and token ID are required');
    }
    
    // Redirect to the HTML page with query parameters
    res.redirect(`/add-to-metamask.html?contract=${contractAddress}&token=${tokenId}`);
  } catch (error) {
    console.error('Error redirecting to NFT import page:', error);
    res.status(500).send('Error processing your request');
  }
});

// Add another endpoint with the same functionality but different path
app.get('/add-nft/:chainId/:contractAddress/:tokenId', async (req, res) => {
  try {
    const { chainId, contractAddress, tokenId } = req.params;
    
    if (!contractAddress || !tokenId) {
      return res.status(400).send('Contract address and token ID are required');
    }
    
    console.log(`Redirecting to NFT import page for chain ${chainId}, contract ${contractAddress}, token ${tokenId}`);
    
    // Ensure we have the actual host for the redirect
    const host = req.get('host') || 'ava-backend-sepia.vercel.app';
    const protocol = req.protocol || 'https';
    const baseUrl = `${protocol}://${host}`;
    
    // Use the direct HTML endpoint instead of redirecting
    res.redirect(`${baseUrl}/nft-import/${chainId}/${contractAddress}/${tokenId}`);
  } catch (error) {
    console.error('Error redirecting to NFT import page:', error);
    res.status(500).send('Error processing your request');
  }
});

// Endpoint to provide MetaMask integration instructions
app.get('/metamask-instructions/:chainId/:contractAddress/:tokenId', async (req, res) => {
  try {
    const { chainId, contractAddress, tokenId } = req.params;
    
    // Validate parameters
    if (!chainId || !contractAddress || !tokenId) {
      return res.status(400).json({
        success: false,
        error: 'Chain ID, contract address, and token ID are required'
      });
    }
    
    // Get the network name based on chain ID
    let networkName = 'Unknown Network';
    let networkRpcUrl = '';
    let blockExplorerUrl = '';
    let openseaUrl = '';
    let numericChainId = chainId;
    
    // Handle text-based chain IDs
    if (chainId === 'sepolia') {
      numericChainId = '11155111';
    } else if (chainId === 'mainnet') {
      numericChainId = '1';
    }
    
    switch (numericChainId) {
      case '11155111': // Sepolia
        networkName = 'Sepolia Test Network';
        networkRpcUrl = 'https://eth-sepolia.public.blastapi.io';
        blockExplorerUrl = `https://sepolia.etherscan.io/token/${contractAddress}?a=${tokenId}`;
        openseaUrl = `https://testnets.opensea.io/assets/sepolia/${contractAddress}/${tokenId}`;
        break;
      case '1': // Ethereum Mainnet
        networkName = 'Ethereum Mainnet';
        networkRpcUrl = 'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161';
        blockExplorerUrl = `https://etherscan.io/token/${contractAddress}?a=${tokenId}`;
        openseaUrl = `https://opensea.io/assets/ethereum/${contractAddress}/${tokenId}`;
        break;
      // Add more networks as needed
    }
    
    res.status(200).json({
      success: true,
      metamaskInstructions: {
        title: "How to Add Your NFT to MetaMask",
        steps: [
          "1. Open your MetaMask wallet and make sure you're on the correct network.",
          `2. Switch to the ${networkName} if you're not already on it.`,
          "3. Scroll down and click on 'NFTs' tab.",
          "4. Click on 'Import NFTs' button at the bottom.",
          `5. Enter the NFT contract address: ${contractAddress}`,
          `6. Enter the NFT Token ID: ${tokenId}`,
          "7. Click 'Import' to add the NFT to your wallet."
        ],
        networkInfo: {
          name: networkName,
          chainId: chainId,
          rpcUrl: networkRpcUrl
        },
        nftInfo: {
          contractAddress: contractAddress,
          tokenId: tokenId,
          blockExplorerUrl: blockExplorerUrl,
          openseaUrl: openseaUrl
        },
        addNetworkInstructions: [
          "If you don't have the network in MetaMask:",
          "1. Open MetaMask and click on the network dropdown at the top.",
          "2. Click 'Add Network'.",
          `3. Enter the RPC URL: ${networkRpcUrl}`,
          `4. Enter Chain ID: ${chainId}`,
          `5. Enter Network Name: ${networkName}`,
          "6. Enter Symbol: ETH",
          "7. Click 'Save'."
        ]
      }
    });
    
  } catch (error) {
    console.error('Error generating MetaMask instructions:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate MetaMask instructions'
    });
  }
});

// Direct MetaMask deep link endpoint
app.get('/metamask-deeplink/:chainId/:contractAddress/:tokenId', async (req, res) => {
  try {
    const { chainId, contractAddress, tokenId } = req.params;
    
    // Validate chain ID
    let numericChainId;
    if (chainId === 'sepolia') {
      numericChainId = '11155111';
    } else if (chainId === 'mainnet') {
      numericChainId = '1';
    } else {
      numericChainId = chainId;
    }
    
    // Convert to hex
    const chainIdHex = '0x' + parseInt(numericChainId).toString(16);
    
    // Format the deep link URL for MetaMask
    // This uses the MetaMask mobile app URI scheme
    const deepLink = `https://metamask.app.link/dapp/watch-asset?asset=ERC721&address=${contractAddress}&tokenId=${tokenId}&chainId=${chainIdHex}`;
    
    // Either redirect or render a page with the deep link
    if (req.query.redirect === 'true') {
      res.redirect(deepLink);
    } else {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Open in MetaMask</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', sans-serif; text-align: center; padding: 20px; }
            .button { background: #f6851b; color: white; border: none; padding: 15px 32px; 
                     font-size: 16px; margin: 20px; cursor: pointer; border-radius: 4px; }
            .qr { margin: 20px auto; max-width: 200px; }
            p { margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1>Open NFT in MetaMask</h1>
          <p>Click the button below to open this NFT directly in the MetaMask mobile app</p>
          <a href="${deepLink}" class="button">Open in MetaMask</a>
          <p>Contract: ${contractAddress}</p>
          <p>Token ID: ${tokenId}</p>
          <p>Chain: ${chainId} (${numericChainId})</p>
        </body>
        </html>
      `);
    }
    
  } catch (error) {
    console.error('Error creating MetaMask deep link:', error);
    res.status(500).send('Error creating MetaMask deep link: ' + error.message);
  }
});

// Test endpoint for MetaMask integration that always returns mock data
app.get('/test/nft/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    const contractAddress = process.env.NFT_CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3';
    
    // Get the host for dynamic URL generation
    const host = req.get('host') || 'ava-backend-sepia.vercel.app';
    const protocol = req.protocol || 'https';
    const baseUrl = `${protocol}://${host}`;
    
    const mockNft = {
      tokenId,
      owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      tokenURI: `ipfs://QmfZbzUHa9cPExnJWn8qEaPU3nA9CT5V2ZAv8Wk37tLugQ`,
      contractAddress,
      metadata: {
        name: `Test NFT #${tokenId}`,
        description: "This is a test NFT for MetaMask integration",
        image: "https://gateway.pinata.cloud/ipfs/QmUFfU2K5gkwcwhnJbVVwacCUjGPF9YgJFQAMeGMjAV4ew"
      },
      metamaskInfo: {
        addToMetamask: `To add this NFT to MetaMask, follow these steps:
        1. Open MetaMask and click on the 'NFTs' tab
        2. Click 'Import NFT'
        3. Enter the Contract Address: ${contractAddress}
        4. Enter the Token ID: ${tokenId}
        5. Click 'Import'`,
        networkInfo: `Make sure your MetaMask is connected to the Sepolia Test Network`,
        contractAddress,
        tokenId,
        openseaUrl: `https://testnets.opensea.io/assets/sepolia/${contractAddress}/${tokenId}`,
        importUrl: `${baseUrl}/add-nft/sepolia/${contractAddress}/${tokenId}`,
        directImportUrl: `${baseUrl}/nft-import/sepolia/${contractAddress}/${tokenId}`,
        deepLink: `${baseUrl}/metamask-deeplink/sepolia/${contractAddress}/${tokenId}`
      }
    };
    
    res.status(200).json({
      success: true,
      nft: mockNft,
      isMockData: true
    });
  } catch (error) {
    console.error('Error in test NFT endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Test endpoint error'
    });
  }
});

// Direct HTML endpoint for MetaMask integration
app.get('/nft-import/:chainId/:contractAddress/:tokenId', async (req, res) => {
  try {
    const { chainId, contractAddress, tokenId } = req.params;
    
    // Get network info
    let networkName = 'Sepolia Test Network';
    let networkChainId = '11155111';
    let blockExplorer = 'https://sepolia.etherscan.io';
    let openseaUrl = `https://testnets.opensea.io/assets/sepolia/${contractAddress}/${tokenId}`;
    
    // Set network info based on chain ID
    if (chainId === 'mainnet' || chainId === '1') {
      networkName = 'Ethereum Mainnet';
      networkChainId = '1';
      blockExplorer = 'https://etherscan.io';
      openseaUrl = `https://opensea.io/assets/ethereum/${contractAddress}/${tokenId}`;
    }
    
    // Get NFT details if available
    let nftDetails = null;
    let tokenImage = '';
    let tokenName = `NFT #${tokenId}`;
    let tokenDescription = '';
    
    try {
      const { getNFTDetails } = require('./utils/nftContract');
      nftDetails = await getNFTDetails(tokenId);
      
      if (nftDetails && nftDetails.tokenURI) {
        const tokenURI = nftDetails.tokenURI;
        console.log(`Found tokenURI: ${tokenURI}`);
        
        // Try to fetch metadata from IPFS
        if (tokenURI.startsWith('ipfs://')) {
          const ipfsHash = tokenURI.replace('ipfs://', '');
          const ipfsGateways = [
            `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
            `https://ipfs.io/ipfs/${ipfsHash}`,
            `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`
          ];
          
          let metadata = null;
          for (const gateway of ipfsGateways) {
            try {
              console.log(`Trying to fetch metadata from ${gateway}`);
              const response = await fetch(gateway, { timeout: 3000 });
              metadata = await response.json();
              if (metadata) break;
            } catch (e) {
              console.log(`Failed to fetch from ${gateway}: ${e.message}`);
            }
          }
          
          if (metadata) {
            console.log('Metadata found:', metadata);
            tokenName = metadata.name || tokenName;
            tokenDescription = metadata.description || '';
            
            // Convert IPFS image to HTTP URL
            if (metadata.image) {
              if (metadata.image.startsWith('ipfs://')) {
                const imageIpfsHash = metadata.image.replace('ipfs://', '');
                tokenImage = `https://gateway.pinata.cloud/ipfs/${imageIpfsHash}`;
              } else {
                tokenImage = metadata.image;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching NFT metadata:', error);
    }
    
    // Generate HTML directly
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Import NFT to MetaMask</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { color: #2c3e50; border-bottom: 2px solid #3498db; }
            .box { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .btn { background: #3498db; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; }
            code { background: #e9ecef; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
            .nft-image { max-width: 300px; margin: 15px 0; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
            .metamask-button { 
                background-color: #f6851b; 
                color: white; 
                padding: 12px 24px; 
                border: none; 
                border-radius: 5px; 
                font-size: 18px; 
                cursor: pointer; 
                display: block; 
                width: 100%; 
                margin: 20px 0; 
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                text-align: center;
                font-weight: bold;
            }
            .metamask-button:hover { background-color: #e2761b; }
        </style>
    </head>
    <body>
        <h1>${tokenName}</h1>
        
        <div class="box">
            <h2>NFT Details</h2>
            ${tokenImage ? `<img src="${tokenImage}" alt="${tokenName}" class="nft-image">` : ''}
            ${tokenDescription ? `<p>${tokenDescription}</p>` : ''}
            <p><strong>Contract Address:</strong> <code id="contractAddress">${contractAddress}</code> 
               <button onclick="copy('contractAddress')" class="btn">Copy</button></p>
            <p><strong>Token ID:</strong> <code id="tokenId">${tokenId}</code> 
               <button onclick="copy('tokenId')" class="btn">Copy</button></p>
            <p><strong>Network:</strong> ${networkName}</p>
            <p><a href="${openseaUrl}" target="_blank" rel="noopener">View on OpenSea</a></p>
            
            <button class="metamask-button" onclick="addToMetaMask()">Add to MetaMask (Desktop)</button>
            
            <p style="margin-top: 15px; text-align: center;">
              <strong>Using Mobile?</strong>
              <br>
              <a href="/metamask-deeplink/${chainId}/${contractAddress}/${tokenId}" style="color: #f6851b; font-weight: bold;">
                Open Directly in MetaMask Mobile App
              </a>
            </p>
        </div>
        
            <div class="box" id="manual-import">
            <h2>Manual Import Instructions</h2>
            <ol>
                <li>Open your MetaMask wallet</li>
                <li>Click on the "NFTs" tab at the bottom</li>
                <li>Click "Import NFT"</li>
                <li>Enter the contract address: <code id="contractAddress2">${contractAddress}</code> 
                   <button onclick="copy('contractAddress2')" class="btn">Copy</button></li>
                <li>Enter the Token ID: <code id="tokenId2">${tokenId}</code> 
                   <button onclick="copy('tokenId2')" class="btn">Copy</button></li>
                <li>Click "Import"</li>
            </ol>
            
            <div style="margin-top: 20px;">
                <button onclick="tryAlternativeMethod()" class="metamask-button" style="background-color: #6c757d;">
                    Try Alternative Import Method
                </button>
            </div>
        </div>
        
        <div class="box">
            <h2>Troubleshooting</h2>
            <ul>
                <li><strong>Wrong Network</strong>: Make sure MetaMask is on the ${networkName} (Chain ID: ${networkChainId})</li>
                <li><strong>NFT Not Visible</strong>: Sometimes it takes a few minutes for the NFT to appear in your wallet</li>
                <li><strong>"Unable to verify ownership" Error</strong>: This can happen when the wallet can't verify NFT ownership. Try the manual method instead.</li>
                <li><strong>Token Standard Issue</strong>: If you're seeing errors about token standards, try the manual import method</li>
            </ul>
        </div>        <script>
            function copy(id) {
                const el = document.getElementById(id);
                navigator.clipboard.writeText(el.textContent)
                    .then(() => alert('Copied to clipboard: ' + el.textContent))
                    .catch(() => alert('Failed to copy'));
            }
            
            // Alternative method that works better with some MetaMask installations
            async function tryAlternativeMethod() {
                try {
                    if (typeof window.ethereum === 'undefined') {
                        alert('MetaMask is not installed! Please install MetaMask first.');
                        return;
                    }
                    
                    // Request access to accounts
                    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                    if (!accounts || accounts.length === 0) {
                        alert('Please connect to MetaMask first');
                        return;
                    }
                    
                    // Get current chain ID
                    const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
                    const requiredChainIdHex = '0x' + parseInt('${networkChainId}').toString(16);
                    
                    if (chainIdHex !== requiredChainIdHex) {
                        if (!confirm('You need to be on the ${networkName} network. Would you like to switch networks?')) {
                            return;
                        }
                        
                        try {
                            await window.ethereum.request({
                                method: 'wallet_switchEthereumChain',
                                params: [{ chainId: requiredChainIdHex }]
                            });
                        } catch (err) {
                            alert('Could not switch networks. Please manually switch to ${networkName} in MetaMask.');
                            return;
                        }
                    }
                    
                    // Using a different method - using eth_call to check if the token exists
                    // This works better with some wallets
                    alert('Attempting alternative import method...\n\nA MetaMask popup will appear. Please approve it to add the NFT.');
                    
                    // Create a sample call to check if the token exists (using ERC721 ownerOf)
                    const ownerOfAbi = '0x6352211e'; // keccak256("ownerOf(uint256)") first 4 bytes
                    const tokenIdHex = parseInt('${tokenId}').toString(16).padStart(64, '0');
                    const data = ownerOfAbi + tokenIdHex;
                    
                    try {
                        // First check if the token exists with a call
                        await window.ethereum.request({
                            method: 'eth_call',
                            params: [{
                                to: '${contractAddress}',
                                data: data
                            }, 'latest']
                        });
                        
                        // Now try the import directly
                        window.location.href = 'https://metamask.app.link/dapp/${window.location.host}/nft-import/${chainId}/${contractAddress}/${tokenId}';
                        
                        setTimeout(() => {
                            alert('If the MetaMask app didn\'t open, please try the manual import method instead.');
                        }, 3000);
                    } catch (error) {
                        console.error('Error in alternative method:', error);
                        alert('The alternative method failed. Please use the manual import method.');
                    }
                } catch (error) {
                    console.error('Error in alternative import method:', error);
                    alert('Error: ' + error.message + '\n\nPlease try the manual import method instead.');
                }
            }
            
            // Log that the page loaded correctly with parameters
            console.log('NFT Import page loaded with:', {
                chainId: '${chainId}',
                contractAddress: '${contractAddress}',
                tokenId: '${tokenId}'
            });
            
            // Function to add NFT directly to MetaMask
            async function addToMetaMask() {
                try {
                    if (typeof window.ethereum === 'undefined') {
                        alert('MetaMask is not installed! Please install MetaMask first.');
                        return;
                    }
                    
                    // Request access to the user's accounts
                    await window.ethereum.request({ method: 'eth_requestAccounts' });
                    
                    // Check if on the right network
                    let chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
                    let requiredChainIdHex = '0x' + parseInt('${networkChainId}').toString(16);
                    
                    console.log('Current chain ID:', chainIdHex);
                    console.log('Required chain ID:', requiredChainIdHex);
                    
                    if (chainIdHex !== requiredChainIdHex) {
                        console.log('Network mismatch, attempting to switch networks');
                        
                        // Try to switch the network
                        try {
                            await window.ethereum.request({
                                method: 'wallet_switchEthereumChain',
                                params: [{ chainId: requiredChainIdHex }]
                            });
                            
                            // Verify the switch was successful
                            chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
                            
                            if (chainIdHex !== requiredChainIdHex) {
                                alert('Please switch to ${networkName} in MetaMask before adding this NFT.');
                                return;
                            }
                            
                            console.log('Successfully switched to the required network');
                        } catch (switchError) {
                            console.error('Error switching network:', switchError);
                            
                            // If the network doesn't exist, we need to add it
                            if (switchError.code === 4902) {
                                try {
                                    await window.ethereum.request({
                                        method: 'wallet_addEthereumChain',
                                        params: [
                                            {
                                                chainId: requiredChainIdHex,
                                                chainName: '${networkName}',
                                                nativeCurrency: {
                                                    name: 'Ethereum',
                                                    symbol: 'ETH',
                                                    decimals: 18
                                                },
                                                rpcUrls: ['https://eth-sepolia.public.blastapi.io'],
                                                blockExplorerUrls: ['https://sepolia.etherscan.io']
                                            }
                                        ]
                                    });
                                    
                                    // Check if now on the right network
                                    chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
                                    if (chainIdHex !== requiredChainIdHex) {
                                        alert('Please switch to ${networkName} in MetaMask before adding this NFT.');
                                        return;
                                    }
                                } catch (addError) {
                                    console.error('Error adding network to MetaMask:', addError);
                                    alert('Could not add the required network to MetaMask. Please switch manually to ${networkName}.');
                                    return;
                                }
                            } else {
                                alert('Could not switch to the required network automatically. Please switch manually to ${networkName}.');
                                return;
                            }
                        }
                    }
                    
                    // Add the NFT to MetaMask
                    // First check which version of wallet_watchAsset is supported
                    let isNewMetaMask = false;
                    try {
                        // Check if we have the newer API for ERC721
                        await window.ethereum.request({
                            method: 'wallet_getCapabilities',
                        }).then(capabilities => {
                            isNewMetaMask = capabilities && capabilities.includes && 
                                            capabilities.includes('wallet_watchAsset_ERC721');
                        }).catch(() => {
                            console.log('Using older MetaMask API');
                            isNewMetaMask = false;
                        });
                    } catch (e) {
                        console.log('Error checking capabilities:', e);
                        isNewMetaMask = false;
                    }
                    
                    console.log('Using newer MetaMask API:', isNewMetaMask);
                    
                    // Use the appropriate API version
                    const wasAdded = await window.ethereum.request({
                        method: 'wallet_watchAsset',
                        params: isNewMetaMask ? 
                            {
                                type: 'ERC721',
                                options: {
                                    address: '${contractAddress}',
                                    tokenId: '${tokenId}'
                                },
                            } : 
                            {
                                type: 'ERC721', 
                                options: {
                                    address: '${contractAddress}',
                                    tokenId: '${tokenId}',
                                    ${tokenImage ? `image: '${tokenImage}',` : ''}
                                    name: '${tokenName.replace(/'/g, "\\'")}',
                                    ${tokenDescription ? `description: '${tokenDescription.replace(/'/g, "\\'")}',` : ''}
                                    symbol: 'NFT'
                                },
                            }
                    });
                    
                    if (wasAdded) {
                        console.log('NFT was added to MetaMask');
                        alert('NFT was added to your MetaMask wallet!');
                    } else {
                        console.log('NFT was not added');
                        alert('NFT was not added to your MetaMask wallet. You can try the manual method instead.');
                    }
                } catch (error) {
                    console.error('Error adding NFT to MetaMask:', error);
                    
                    // Provide more specific guidance based on error messages
                    if (error.message.includes('verify ownership') || error.message.includes('standard is not supported')) {
                        alert('MetaMask couldn\'t verify ownership of this NFT. This could be because:\n\n' +
                              '1. You need to switch to the ${networkName} network\n' +
                              '2. You may not own this NFT\n' +
                              '3. The contract may need to be verified on Etherscan\n\n' +
                              'Try using the manual import method instead.');
                        
                        // Show manual import method more prominently
                        document.querySelector('.box:nth-child(2)').style.backgroundColor = '#fff3cd';
                        document.querySelector('.box:nth-child(2)').style.borderLeft = '4px solid #ffc107';
                    } else if (error.message.includes('user rejected')) {
                        alert('You rejected the MetaMask request. Please try again if you want to add the NFT.');
                    } else {
                        alert('Error adding NFT to MetaMask: ' + error.message + '\n\nPlease try the manual method below.');
                    }
                    
                    // Log detailed error for debugging
                    console.log({
                        errorMessage: error.message,
                        contractAddress: '${contractAddress}',
                        tokenId: '${tokenId}',
                        chainId: '${networkChainId}',
                        networkName: '${networkName}'
                    });
                }
            }
        </script>
    </body>
    </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Error generating NFT import page:', error);
    res.status(500).send('Error generating NFT import page: ' + error.message);
  }
});

// Add error handling for the server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process
});
