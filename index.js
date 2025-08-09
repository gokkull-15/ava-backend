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
console.log('Attempting to connect to MongoDB...');
const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://gokkull04:gokul%40123@cluster0.pe15z0t.mongodb.net/ava-lang';
console.log('Using connection string (masked): ' + mongoURI.replace(/\/\/.*@/, '//****:****@'));

mongoose.connect(mongoURI, {
  serverSelectionTimeoutMS: 50000, // Timeout after 50s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity,
  retryWrites: true,
  w: 'majority'
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => {
  console.error('MongoDB connection error details:', err);
  console.error('MongoDB connection error code:', err.code);
  console.error('MongoDB connection error name:', err.name);
});

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
