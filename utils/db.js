// db.js - Central place for database connections and models
const mongoose = require('mongoose');
require('dotenv').config();

// Connection state
let mongoConnected = false;

// Schemas
const DataJsonSchema = new mongoose.Schema({
  data: Object,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  ipfsHash: String,
  pinataUrl: String
});

const DetailJsonSchema = new mongoose.Schema({
  data: Object,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  ipfsHash: String,
  pinataUrl: String
});

const ContractDataSchema = new mongoose.Schema({
  data: Object,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  dataJsonId: mongoose.Schema.Types.ObjectId,
  detailJsonId: mongoose.Schema.Types.ObjectId
});

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

// Models
const DataJson = mongoose.models.DataJson || mongoose.model('DataJson', DataJsonSchema);
const DetailJson = mongoose.models.DetailJson || mongoose.model('DetailJson', DetailJsonSchema);
const ContractData = mongoose.models.ContractData || mongoose.model('ContractData', ContractDataSchema);
const IPFSStorage = mongoose.models.IPFSStorage || mongoose.model('IPFSStorage', IPFSStorageSchema);

// Connect to MongoDB
const connectToMongo = async () => {
  if (mongoose.connection.readyState === 1) {
    console.log('MongoDB already connected');
    mongoConnected = true;
    return;
  }

  try {
    // Try to connect to MongoDB
    const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/ava-backend';
    
    await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('MongoDB connected successfully');
    mongoConnected = true;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    mongoConnected = false;
  }
};

// Check connection status
const isConnected = () => {
  return mongoConnected || mongoose.connection.readyState === 1;
};

// Initial connection attempt
connectToMongo();

module.exports = {
  mongoose,
  connectToMongo,
  isConnected,
  DataJson,
  DetailJson,
  ContractData,
  IPFSStorage
};
