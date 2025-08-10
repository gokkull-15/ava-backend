const mongoose = require('mongoose');

const IPFSStorageSchema = new mongoose.Schema({
  ipfsHash: String,
  pinataUrl: String,
  originalData: Object,
  dataJsonId: mongoose.Schema.Types.ObjectId,
  contractTransaction: {
    txHash: String,
    blockNumber: Number,
    timestamp: Number,
    index: Number,
    sender: String
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.IPFSStorage || mongoose.model('IPFSStorage', IPFSStorageSchema);
