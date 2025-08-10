// Import from the central db.js file
const { isConnected, IPFSStorage } = require('../utils/db');

// Get stored IPFS hashes
const getStoredIPFS = async (req, res) => {
  try {
    if (!isConnected()) {
      return res.status(200).json({
        message: 'MongoDB not connected',
        data: [],
        mongoStatus: 0
      });
    }
    
    const data = await IPFSStorage.find().sort({ createdAt: -1 }).limit(10);
    
    return res.status(200).json({
      data,
      count: data.length,
      mongoStatus: 1
    });
    
  } catch (err) {
    console.error('Error retrieving stored IPFS data:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get stored IPFS hash by index
const getStoredIPFSByIndex = async (req, res) => {
  try {
    const { index } = req.params;
    
    // First try to get it from the database
    if (isConnected()) {
      try {
        const storedData = await IPFSStorage.findOne({ 'contractTransaction.index': index });
        
        if (storedData) {
          return res.status(200).json({
            success: true,
            data: storedData,
            source: 'database'
          });
        }
      } catch (dbErr) {
        console.error('Database error:', dbErr.message);
      }
    }
    
    // If not found in database, try to get it from the contract
    const { getStoredIPFSHash } = require('../utils/nftContract');
    const result = await getStoredIPFSHash(index);
    
    if (result.success) {
      return res.status(200).json({
        ...result,
        source: 'contract'
      });
    } else {
      return res.status(404).json({
        success: false,
        error: `No stored IPFS hash found with index ${index}`
      });
    }
    
  } catch (err) {
    console.error(`Error retrieving stored IPFS hash at index ${req.params.index}:`, err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getStoredIPFS,
  getStoredIPFSByIndex
};
