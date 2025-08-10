require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const CryptoJS = require('crypto-js');
const pinataSDK = require('@pinata/sdk');
const path = require('path');
const { mintNFTWithIPFS, getProvider } = require('./utils/nftContract');

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
    blockNumber: Number,
    timestamp: Number,
    mintedAt: {
      type: Date,
      default: Date.now
    }
  }
});

// Schema for storing IPFS hash transaction details
const IPFSStorageSchema = new mongoose.Schema({
  ipfsHash: String,
  pinataUrl: String,
  originalData: mongoose.Schema.Types.Mixed,
  dataJsonId: String,
  contractTransaction: {
    txHash: String,
    blockNumber: Number,
    timestamp: Number,
    index: String,
    sender: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const DataJson = mongoose.model('DataJson', DataJsonSchema);
const DetailJson = mongoose.model('DetailJson', DetailJsonSchema);
const ContractData = mongoose.model('ContractData', ContractDataSchema);
const IPFSStorage = mongoose.model('IPFSStorage', IPFSStorageSchema);

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
    let ipfsResult = null;
    
    // Based on the updated flow, we now SHOULD pin to IPFS for datajson
    try {
      ipfsResult = await pinJSONToIPFS(data, 'datajson-' + Date.now());
      console.log('DataJson pinned to IPFS:', ipfsResult?.ipfsHash);
    } catch (ipfsErr) {
      console.error('IPFS error:', ipfsErr.message);
      // Continue even if IPFS pinning fails
    }
    
    // Try to save to MongoDB if connected
    if (mongoConnected) {
      try {
        const dataEntry = new DataJson({
          data,
          timestamp: new Date()
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
      mongoStatus: mongoConnected ? 1 : 0,
      ipfs: ipfsResult || null
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
    const { recipientAddress, ipfsHash, dataJsonId } = req.body;
    
    if (!recipientAddress) {
      return res.status(400).json({
        success: false,
        error: 'Recipient Ethereum address is required'
      });
    }
    
    // If ipfsHash is provided directly, use it
    // Otherwise, try to get it from dataJsonId
    let actualIpfsHash = ipfsHash;
    let dataJsonData = null;
    
    if (!actualIpfsHash && dataJsonId) {
      // Try to find the DataJson entry and get its IPFS hash
      if (!mongoConnected) {
        return res.status(503).json({
          success: false,
          error: 'MongoDB not connected',
          mongoStatus: 0
        });
      }
      
      try {
        const dataJsonEntry = await DataJson.findById(dataJsonId);
        
        if (!dataJsonEntry) {
          return res.status(404).json({
            success: false,
            error: `DataJson with ID ${dataJsonId} not found`
          });
        }
        
        dataJsonData = dataJsonEntry.data;
        
        // Check if the DataJson entry already has an IPFS hash (from the updated datajson endpoint)
        if (dataJsonEntry.ipfsHash) {
          actualIpfsHash = dataJsonEntry.ipfsHash;
          console.log(`Using existing IPFS hash from dataJsonId: ${actualIpfsHash}`);
        } else {
          // Pin data to IPFS to get a hash
          const ipfsResult = await pinJSONToIPFS(dataJsonEntry.data, 'nft-from-datajson-' + Date.now());
          
          if (!ipfsResult || !ipfsResult.ipfsHash) {
            return res.status(500).json({
              success: false,
              error: 'Failed to pin data to IPFS'
            });
          }
          
          actualIpfsHash = ipfsResult.ipfsHash;
          console.log(`Generated new IPFS hash from dataJsonId: ${actualIpfsHash}`);
        }
        
      } catch (dbError) {
        console.error('Error fetching DataJson entry:', dbError);
        return res.status(500).json({
          success: false,
          error: 'Error fetching DataJson entry: ' + dbError.message
        });
      }
    }
    
    if (!actualIpfsHash) {
      return res.status(400).json({
        success: false,
        error: 'Either IPFS hash or dataJsonId is required'
      });
    }
    
    console.log(`Minting NFT to ${recipientAddress} with IPFS hash: ${actualIpfsHash}`);
    
    // Format IPFS hash for MetaMask compatibility
    let formattedIpfsHash = actualIpfsHash;
    if (!formattedIpfsHash.startsWith('ipfs://')) {
      formattedIpfsHash = `ipfs://${actualIpfsHash}`;
    }
    
    // Mint the NFT using the contract utility with mintWithIPFS function
    const result = await mintNFTWithIPFS(recipientAddress, formattedIpfsHash);
    
    if (result.success) {
      // Store transaction details in the database
      if (mongoConnected) {
        try {
          // Get the block timestamp if not provided in the result
          let timestamp = result.timestamp;
          if (!timestamp && result.blockNumber) {
            const provider = getProvider();
            const block = await provider.getBlock(result.blockNumber);
            timestamp = block ? block.timestamp : Math.floor(Date.now() / 1000);
          }
          
          // If we used dataJsonId, store a reference to the original data
          let contractData = {
            ipfsHash: actualIpfsHash,
            pinataUrl: `https://gateway.pinata.cloud/ipfs/${actualIpfsHash.replace('ipfs://', '')}`,
            nftData: {
              tokenId: result.tokenId,
              recipientAddress: recipientAddress,
              txHash: result.txHash,
              blockNumber: result.blockNumber,
              timestamp: timestamp
            }
          };
          
          if (dataJsonData) {
            contractData.data = dataJsonData;
          }
          
          const contractEntry = new ContractData(contractData);
          await contractEntry.save();
          console.log('Saved contract data with NFT information');
        } catch (saveError) {
          console.error('Error saving contract data:', saveError);
          // Continue with the response even if saving fails
        }
      }
      
      // Get the host for dynamic URL generation
      const host = req.get('host') || 'ava-backend-sepia.vercel.app';
      const protocol = req.protocol || 'https';
      const baseUrl = `${protocol}://${host}`;
      const chainId = 'sepolia'; // Default to Sepolia testnet
      const contractAddress = result.contractAddress || process.env.NFT_CONTRACT_ADDRESS;
      const tokenId = result.tokenId;

      // Add MetaMask integration URLs to the response
      const metamaskInfo = {
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
        // Add direct links for MetaMask integration
        importUrl: `${baseUrl}/add-nft/${chainId}/${contractAddress}/${tokenId}`,
        directImportUrl: `${baseUrl}/nft-import/${chainId}/${contractAddress}/${tokenId}`,
        deepLink: `${baseUrl}/metamask-deeplink/${chainId}/${contractAddress}/${tokenId}`
      };

      // Return the enhanced result
      res.status(200).json({
        ...result,
        metamaskInfo,
        metamaskIntegration: {
          openPage: `${baseUrl}/nft-import/${chainId}/${contractAddress}/${tokenId}`,
          openMobileApp: `${baseUrl}/metamask-deeplink/${chainId}/${contractAddress}/${tokenId}`
        },
        ipfsHash: actualIpfsHash,
        dataJsonId: dataJsonId || null
      });
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
      
      // Get the host for dynamic URL generation
      const host = req.get('host') || 'ava-backend-sepia.vercel.app';
      const protocol = req.protocol || 'https';
      const baseUrl = `${protocol}://${host}`;
      const chainId = 'sepolia'; // Default to Sepolia testnet
      const contractAddress = mintResult.contractAddress || process.env.NFT_CONTRACT_ADDRESS;
      const tokenId = mintResult.tokenId;

      // Add MetaMask integration URLs to the response
      const metamaskInfo = {
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
        // Add direct links for MetaMask integration
        importUrl: `${baseUrl}/add-nft/${chainId}/${contractAddress}/${tokenId}`,
        directImportUrl: `${baseUrl}/nft-import/${chainId}/${contractAddress}/${tokenId}`,
        deepLink: `${baseUrl}/metamask-deeplink/${chainId}/${contractAddress}/${tokenId}`
      };
      
      // Return enhanced result with MetaMask integration links
      res.status(200).json({
        success: true,
        nft: {
          ...mintResult,
          metamaskInfo
        },
        ipfs: ipfsResult,
        originalDataJsonId: dataJsonId,
        metamaskIntegration: {
          openPage: `${baseUrl}/nft-import/${chainId}/${contractAddress}/${tokenId}`,
          openMobileApp: `${baseUrl}/metamask-deeplink/${chainId}/${contractAddress}/${tokenId}`
        }
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

// Success page for minted NFTs
app.get('/mint-success/:chainId/:contractAddress/:tokenId', async (req, res) => {
  try {
    const { chainId, contractAddress, tokenId } = req.params;
    const txHash = req.query.txHash || '';
    
    // Redirect to the success page with parameters
    res.redirect(`/mint-success.html?chainId=${chainId}&contract=${contractAddress}&tokenId=${tokenId}&txHash=${txHash}`);
  } catch (error) {
    console.error('Error redirecting to success page:', error);
    res.status(500).send('Error processing your request');
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
    
    // Get the host for URL generation
    const host = req.get('host') || 'ava-backend-sepia.vercel.app';
    const protocol = req.protocol || 'https';
    
    // Format the deep link URL for MetaMask
    // This uses the MetaMask mobile app URI scheme
    const deepLink = `https://metamask.app.link/dapp/${host}/mm-watch-asset.html?asset=ERC721&address=${contractAddress}&tokenId=${tokenId}&chainId=${chainIdHex}`;
    
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
          
          <div style="margin-top: 40px;">
            <h2>Manual Import Instructions</h2>
            <ol style="text-align: left; display: inline-block;">
              <li>Open your MetaMask mobile app</li>
              <li>Tap on the NFTs tab</li>
              <li>Tap "Import NFT"</li>
              <li>Enter the contract address: <code>${contractAddress}</code></li>
              <li>Enter the Token ID: <code>${tokenId}</code></li>
              <li>Tap Import</li>
            </ol>
          </div>
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

// Import routes
const nftImportRoute = require('./routes/nftImport');
const storeIPFSHashRoute = require('./routes/storeIPFSHash');
const { getStoredIPFS, getStoredIPFSByIndex } = require('./routes/getStoredIPFS');

// Use the NFT import route directly
app.get('/nft-import/:chainId/:contractAddress/:tokenId', nftImportRoute);

// Endpoint to store only IPFS hash in the contract
app.post('/store-ipfs', storeIPFSHashRoute);

// Get stored IPFS hashes endpoints
app.get('/stored-ipfs', getStoredIPFS);

// Get stored IPFS hash by index
app.get('/stored-ipfs/:index', getStoredIPFSByIndex);

// The NFT import functionality has been moved to a dedicated route in routes/nftImport.js

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
