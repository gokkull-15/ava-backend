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

// Connect to MongoDB with improved error handling
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 50000, // Timeout after 50s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

const DataJsonSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
});
const DetailJsonSchema = new mongoose.Schema({
  detail: mongoose.Schema.Types.Mixed,
});

const DataJson = mongoose.model('DataJson', DataJsonSchema);
const DetailJson = mongoose.model('DetailJson', DetailJsonSchema);

app.post('/datajson', async (req, res) => {
  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.log('MongoDB not connected, status:', mongoose.connection.readyState);
      return res.status(500).json({ error: 'Database connection not available' });
    }
    
    const entry = new DataJson({ data: req.body });
    await entry.save();
    res.status(201).json({ message: 'Data saved', entry });
  } catch (err) {
    console.error('Error saving to datajson:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/detailjson', async (req, res) => {
  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.log('MongoDB not connected, status:', mongoose.connection.readyState);
      return res.status(500).json({ error: 'Database connection not available' });
    }
    
    const entry = new DetailJson({ detail: req.body });
    await entry.save();
    res.status(201).json({ message: 'Detail saved', entry });
  } catch (err) {
    console.error('Error saving to detailjson:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
