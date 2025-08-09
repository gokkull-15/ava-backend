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

// Let's try to connect without options first for simplicity
console.log('Attempting to connect to MongoDB...');
const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://gokkull04:gokul%40123@cluster0.pe15z0t.mongodb.net/ava-lang';
console.log('Using connection string (masked): ' + mongoURI.replace(/\/\/.*@/, '//****:****@'));

mongoose.connect(mongoURI)
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
    // Check MongoDB connection but still allow the API to work for testing
    if (mongoose.connection.readyState !== 1) {
      console.log('MongoDB not connected, status:', mongoose.connection.readyState);
      // Return a mock response for testing
      return res.status(200).json({ 
        message: 'MongoDB not connected, but API is working',
        received: req.body,
        mongoStatus: mongoose.connection.readyState
      });
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
    // Check MongoDB connection but still allow the API to work for testing
    if (mongoose.connection.readyState !== 1) {
      console.log('MongoDB not connected, status:', mongoose.connection.readyState);
      // Return a mock response for testing
      return res.status(200).json({ 
        message: 'MongoDB not connected, but API is working',
        received: req.body,
        mongoStatus: mongoose.connection.readyState
      });
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
