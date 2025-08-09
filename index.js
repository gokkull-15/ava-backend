require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
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
    const entry = new DataJson({ data: req.body });
    await entry.save();
    res.status(201).json({ message: 'Data saved', entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/detailjson', async (req, res) => {
  try {
    const entry = new DetailJson({ detail: req.body });
    await entry.save();
    res.status(201).json({ message: 'Detail saved', entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
