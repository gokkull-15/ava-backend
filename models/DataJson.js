const mongoose = require('mongoose');

const DataJsonSchema = new mongoose.Schema({
  data: Object,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  ipfsHash: String,
  pinataUrl: String
});

module.exports = mongoose.models.DataJson || mongoose.model('DataJson', DataJsonSchema);
