const mongoose = require('mongoose');

const ContractDataSchema = new mongoose.Schema({
  data: Object,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  dataJsonId: mongoose.Schema.Types.ObjectId,
  detailJsonId: mongoose.Schema.Types.ObjectId
});

module.exports = mongoose.models.ContractData || mongoose.model('ContractData', ContractDataSchema);
