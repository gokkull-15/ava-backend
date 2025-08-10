// serverless.js - A simplified version of our server for Vercel deployment
const express = require('express');
const app = express();
const path = require('path');
require('dotenv').config();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Simple root endpoint to verify the server is running
app.get('/', (req, res) => {
  res.status(200).json({
    message: "API working",
    deployment: "Vercel",
    timestamp: new Date().toISOString()
  });
});

// Healthcheck endpoint
app.get('/healthcheck', (req, res) => {
  res.status(200).json({
    status: "healthy",
    version: "1.0",
    timestamp: new Date().toISOString(),
    database: "disconnected",
    environment: {
      mongodb: process.env.MONGODB_URI ? "configured" : "not configured",
      pinata: process.env.PINATA_API_KEY ? "configured" : "not configured",
      nftContract: process.env.NFT_CONTRACT_ADDRESS ? "configured" : "not configured",
      rpcUrl: process.env.SEPOLIA_RPC_URL ? "configured" : "not configured",
      privateKey: process.env.PRIVATE_KEY ? "configured" : "not configured"
    }
  });
});

// API routes for testing
app.post('/datajson', async (req, res) => {
  try {
    const data = req.body;
    // Mock IPFS response
    const mockIpfsHash = 'QmTest' + Math.random().toString(36).substring(2, 15);
    
    res.status(200).json({
      message: 'Request received',
      received: data,
      saved: false,
      id: null,
      mongoStatus: 0,
      ipfs: {
        ipfsHash: mockIpfsHash,
        pinataUrl: `https://gateway.pinata.cloud/ipfs/${mockIpfsHash}`,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error processing datajson:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to process datajson request' 
    });
  }
});

// GET endpoint for datajson
app.get('/datajson', async (req, res) => {
  try {
    // Mock response since we don't have a database
    res.status(200).json({
      message: 'MongoDB not connected',
      data: [],
      mongoStatus: 0
    });
  } catch (error) {
    console.error('Error retrieving datajson:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to retrieve datajson' 
    });
  }
});

// Mock NFT minting endpoint
app.post('/mint-nft', async (req, res) => {
  try {
    const { recipientAddress, ipfsHash, dataJsonId } = req.body;
    
    if (!recipientAddress) {
      return res.status(400).json({
        success: false,
        error: 'Recipient address is required'
      });
    }
    
    if (!ipfsHash && !dataJsonId) {
      return res.status(400).json({
        success: false,
        error: 'Either IPFS hash or dataJsonId is required'
      });
    }
    
    // Mock transaction hash and data
    const mockTxHash = '0x' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const mockBlockNumber = Math.floor(8900000 + Math.random() * 100000);
    const mockTokenId = Math.floor(1 + Math.random() * 1000);
    
    res.status(200).json({
      success: true,
      txHash: mockTxHash,
      tokenId: mockTokenId,
      blockNumber: mockBlockNumber,
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      ipfsHash: ipfsHash || 'ipfs://QmSimulatedHashForDataJson',
      dataJsonId: dataJsonId || null,
      metamaskInfo: {
        addToMetamask: `To add this NFT to MetaMask, follow these steps:\n        1. Open MetaMask and click on the 'NFTs' tab\n        2. Click 'Import NFT'\n        3. Enter the Contract Address: 0x5FbDB2315678afecb367f032d93F642f64180aa3\n        4. Enter the Token ID: ${mockTokenId}\n        5. Click 'Import'`,
        networkInfo: "Make sure your MetaMask is connected to the Sepolia Test Network",
        contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        tokenId: mockTokenId.toString(),
        openseaUrl: `https://testnets.opensea.io/assets/sepolia/0x5FbDB2315678afecb367f032d93F642f64180aa3/${mockTokenId}`,
        importUrl: `https://ava-backend-sepia.vercel.app/add-nft/sepolia/0x5FbDB2315678afecb367f032d93F642f64180aa3/${mockTokenId}`
      }
    });
  } catch (error) {
    console.error('Error minting NFT:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to mint NFT' 
    });
  }
});

// Mock store IPFS hash endpoint
app.post('/store-ipfs', async (req, res) => {
  try {
    const { ipfsHash, dataJsonId } = req.body;
    
    if (!ipfsHash && !dataJsonId) {
      return res.status(400).json({
        success: false,
        error: 'Either IPFS hash or dataJsonId is required'
      });
    }
    
    // Mock transaction data
    const mockTxHash = '0x' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const mockBlockNumber = Math.floor(8900000 + Math.random() * 100000);
    const mockIndex = Math.floor(Math.random() * 100);
    
    res.status(200).json({
      success: true,
      txHash: mockTxHash,
      blockNumber: mockBlockNumber,
      index: mockIndex,
      ipfsHash: ipfsHash || 'ipfs://QmSimulatedHashForDataJson',
      dataJsonId: dataJsonId || null,
      message: 'IPFS hash stored in contract'
    });
  } catch (error) {
    console.error('Error storing IPFS hash:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to store IPFS hash' 
    });
  }
});

// Retrieve all stored IPFS hashes
app.get('/stored-ipfs', async (req, res) => {
  try {
    // Mock response
    res.status(200).json({
      message: 'MongoDB not connected',
      data: [],
      mongoStatus: 0
    });
  } catch (error) {
    console.error('Error retrieving stored IPFS data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to retrieve stored IPFS data' 
    });
  }
});

// Retrieve stored IPFS hash by index
app.get('/stored-ipfs/:index', async (req, res) => {
  try {
    const { index } = req.params;
    
    // Mock response
    res.status(200).json({
      success: true,
      index: parseInt(index),
      ipfsHash: `ipfs://QmMockHashForIndex${index}`,
      source: 'contract'
    });
  } catch (error) {
    console.error(`Error retrieving stored IPFS hash:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to retrieve IPFS hash' 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Server error', 
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message 
  });
});

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// For serverless environments like Vercel
module.exports = app;
