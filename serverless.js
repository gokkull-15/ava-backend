// serverless.js - A simplified version of our server for Vercel deployment
const express = require('express');
const app = express();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple root endpoint to verify the server is running
app.get('/', (req, res) => {
  res.status(200).json({
    message: "API working",
    deployment: "Vercel",
    timestamp: new Date().toISOString()
  });
});

// Healthcheck endpoint
app.get('/healthcheck', (req, res) => {
  res.status(200).json({
    status: "healthy",
    version: "1.0",
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Server error', 
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message 
  });
});

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// For serverless environments like Vercel
module.exports = app;
