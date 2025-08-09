require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const CryptoJS = require('crypto-js');
const pinataSDK = require('@pinata/sdk');

const app = express();
app.use(bodyParser.json());

// Add connection status endpoint
app.get('/', (req, res) => {
  res.status(200).send('Server is running');
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
  ipfsHash: String,
  pinataUrl: String,
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
const HashSchema = new mongoose.Schema({
  text: String,
  hash: String,
  algorithm: {
    type: String,
    default: 'SHA256'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const DataJson = mongoose.model('DataJson', DataJsonSchema);
const DetailJson = mongoose.model('DetailJson', DetailJsonSchema);
const Hash = mongoose.model('Hash', HashSchema);

// Initialize Pinata client
let pinata = null;
try {
  if (process.env.PINATA_API_KEY && process.env.PINATA_SECRET_KEY) {
    pinata = pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_KEY);
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

// Try to connect to MongoDB, but don't block server startup
connectWithTimeout();

// Endpoints
app.post('/datajson', async (req, res) => {
  try {
    const data = req.body;
    let ipfsResult = null;
    let savedData = null;
    
    // Try to pin to IPFS
    ipfsResult = await pinJSONToIPFS(data, 'ava-data-' + Date.now());
    
    // Try to save to MongoDB if connected
    if (mongoConnected) {
      try {
        const dataEntry = new DataJson({
          data,
          ...(ipfsResult || {})
        });
        savedData = await dataEntry.save();
      } catch (dbErr) {
        console.error('Database error:', dbErr.message);
      }
    }
    
    return res.status(200).json({
      message: 'Request received',
      received: data,
      ipfs: ipfsResult,
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

// New hash endpoints
app.post('/hash', async (req, res) => {
  try {
    const { text, algorithm = 'SHA256' } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text to hash is required' });
    }
    
    let hash;
    switch (algorithm.toUpperCase()) {
      case 'MD5':
        hash = CryptoJS.MD5(text).toString();
        break;
      case 'SHA1':
        hash = CryptoJS.SHA1(text).toString();
        break;
      case 'SHA256':
      default:
        hash = CryptoJS.SHA256(text).toString();
    }
    
    // Create hash entry
    const hashEntry = {
      text,
      hash,
      algorithm: algorithm.toUpperCase(),
      createdAt: new Date()
    };
    
    // Try to save if MongoDB is connected
    let saved = false;
    let id = null;
    if (mongoConnected) {
      try {
        const savedEntry = await new Hash(hashEntry).save();
        if (savedEntry) {
          saved = true;
          id = savedEntry._id;
        }
      } catch (dbErr) {
        console.log('Error saving to database:', dbErr.message);
      }
    }
    
    return res.status(201).json({
      ...hashEntry,
      saved,
      id,
      mongoStatus: mongoConnected ? 1 : 0
    });
    
  } catch (err) {
    console.error('Error in hash endpoint:', err);
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

app.get('/hash', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(200).json({
        message: 'MongoDB not connected',
        hashes: [],
        mongoStatus: 0
      });
    }
    
    const hashes = await Hash.find().sort({ createdAt: -1 }).limit(10);
    
    return res.status(200).json({
      hashes,
      count: hashes.length,
      mongoStatus: 1
    });
    
  } catch (err) {
    console.error('Error retrieving hashes:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

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
