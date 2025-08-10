const mongoose = require('mongoose');

const DetailJsonSchema = new mongoose.Schema({
  data: Object,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  ipfsHash: String,
  pinataUrl: String
});

module.exports = mongoose.models.DetailJson || mongoose.model('DetailJson', DetailJsonSchema);
