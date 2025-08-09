require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const CryptoJS = require('crypto-js');
const pinataSDK = require('@pinata/sdk');
const { mintNFTWithIPFS } = require('./utils/nftContract');

const app = express();
app.use(bodyParser.json());

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
    
    // Mint the NFT using the contract utility
    const result = await mintNFTWithIPFS(recipientAddress, ipfsHash);
    
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

// Endpoint to mint an NFT directly from a DataJson entry
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
    
    // Mint the NFT with the IPFS hash
    const mintResult = await mintNFTWithIPFS(recipientAddress, ipfsResult.ipfsHash);
    
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
