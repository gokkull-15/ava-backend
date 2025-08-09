require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

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
});
const DetailJsonSchema = new mongoose.Schema({
  detail: mongoose.Schema.Types.Mixed,
});

const DataJson = mongoose.model('DataJson', DataJsonSchema);
const DetailJson = mongoose.model('DetailJson', DetailJsonSchema);

// Connect to MongoDB with basic error handling
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB connection error:', err.message));

// Endpoints
app.post('/datajson', async (req, res) => {
  try {
    // Always return success for now
    return res.status(200).json({
      message: 'Request received',
      received: req.body,
      mongoStatus: mongoose.connection.readyState
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/detailjson', async (req, res) => {
  try {
    // Always return success for now
    return res.status(200).json({
      message: 'Request received',
      received: req.body,
      mongoStatus: mongoose.connection.readyState
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
