// Function to handle storing IPFS hash in the contract
// Import required modules
const mongoose = require('mongoose');
const DataJson = require('../models/DataJson');
const IPFSStorage = require('../models/IPFSStorage');
const { pinJSONToIPFS } = require('../utils/ipfs');

// Helper function to check MongoDB connection
const isConnected = () => mongoose.connection.readyState === 1;

const handleStoreIPFSHash = async (req, res) => {
  try {
    const { ipfsHash, dataJsonId } = req.body;
    let actualIpfsHash = ipfsHash;
    let dataJsonData = null;
    
    // Validate inputs
    if (!actualIpfsHash && !dataJsonId) {
      return res.status(400).json({
        success: false,
        error: 'Either IPFS hash or dataJsonId is required'
      });
    }
    
    // If only dataJsonId is provided, get the IPFS hash from it
    if (!actualIpfsHash && dataJsonId) {
      if (!isConnected()) {
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
        
        // Check if dataJson already has an IPFS hash
        if (dataJsonEntry.ipfsHash) {
          actualIpfsHash = dataJsonEntry.ipfsHash;
        } else {
          // Pin to IPFS to get a hash
          const ipfsResult = await pinJSONToIPFS(dataJsonEntry.data, 'store-ipfs-from-datajson-' + Date.now());
          
          if (!ipfsResult || !ipfsResult.ipfsHash) {
            return res.status(500).json({
              success: false,
              error: 'Failed to pin data to IPFS'
            });
          }
          
          actualIpfsHash = ipfsResult.ipfsHash;
        }
        
        console.log(`Using IPFS hash from dataJsonId: ${actualIpfsHash}`);
        
      } catch (dbError) {
        console.error('Error fetching DataJson entry:', dbError);
        return res.status(500).json({
          success: false,
          error: 'Error fetching DataJson entry: ' + dbError.message
        });
      }
    }
    
    // Use the contract utility to store the IPFS hash
    const { storeIPFSHash } = require('../utils/nftContract');
    const result = await storeIPFSHash(actualIpfsHash);
    
    // If successful, store transaction details in the database
    if (result.success && isConnected()) {
      try {
        const storageEntry = new IPFSStorage({
          ipfsHash: actualIpfsHash,
          pinataUrl: `https://gateway.pinata.cloud/ipfs/${actualIpfsHash.replace('ipfs://', '')}`,
          originalData: dataJsonData,
          dataJsonId: dataJsonId || null,
          contractTransaction: {
            txHash: result.txHash,
            blockNumber: result.blockNumber,
            timestamp: result.timestamp,
            index: result.index,
            sender: result.sender
          }
        });
        
        await storageEntry.save();
        console.log('Saved IPFS storage transaction details');
      } catch (dbError) {
        console.error('Error saving IPFS storage transaction:', dbError);
        // Continue with the response even if saving fails
      }
    }
    
    res.status(200).json({
      success: result.success,
      ipfsHash: actualIpfsHash,
      dataJsonId: dataJsonId || null,
      ...result,
      message: 'IPFS hash stored in contract'
    });
    
  } catch (error) {
    console.error('Error storing IPFS hash in contract:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to store IPFS hash'
    });
  }
};

module.exports = handleStoreIPFSHash;
