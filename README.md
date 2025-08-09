# AVA Backend API

This is a backend API built with Express.js, MongoDB, and Pinata IPFS integration. The API provides endpoints for storing JSON data, detailed information, and generating cryptographic hashes.

## Live API

The API is deployed on Vercel and accessible at:

[https://ava-backend-sepia.vercel.app/](https://ava-backend-sepia.vercel.app/)

## Features

- Store and retrieve JSON data with MongoDB
- Pin data to IPFS using Pinata
- Store contract data with IPFS hashes
- RESTful API design

## API Endpoints

### Server Status

- **GET /** - Check if the server is running

### Data JSON

- **GET /datajson** - Retrieve all data entries stored in MongoDB with IPFS information
- **POST /datajson** - Send JSON data to be stored in MongoDB and pinned to IPFS

### Detail JSON

- **GET /detailjson** - Retrieve all detail entries stored in MongoDB with IPFS information
- **POST /detailjson** - Send detail JSON data to be stored in MongoDB and pinned to IPFS

### Contract Data

- **GET /contract-data** - Retrieve all contract data entries stored in MongoDB with IPFS information
- **POST /contract-data** - Send contract data to be stored in MongoDB and pinned to IPFS

## Environment Variables

```
MONGODB_URI=mongodb+srv://your_mongodb_connection_string
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key
```

## Postman Collection

A Postman collection is included in this repository. To use it:

1. Download the `AVA_Backend_API.postman_collection.json` file
2. Open Postman
3. Click on "Import" in the top left corner
4. Upload the collection file
5. All API endpoints will be available with example requests

## Local Development

### Setup

```bash
# Clone the repository
git clone https://github.com/gokkull-15/ava-backend.git

# Navigate to the project directory
cd ava-backend

# Install dependencies
npm install

# Create .env file with your environment variables
touch .env

# Start the server
node index.js
```

### Testing Locally

Use curl or Postman to test the API endpoints:

```bash
# Test server status
curl http://localhost:3000/

# Test POST datajson
curl -X POST -H "Content-Type: application/json" -d '{"data": "Test data"}' http://localhost:3000/datajson

# Test POST detailjson
curl -X POST -H "Content-Type: application/json" -d '{"title": "Test title", "description": "Test description"}' http://localhost:3000/detailjson

# Test POST contract-data
curl -X POST -H "Content-Type: application/json" -d '{"contractName": "Sample Contract", "version": "1.0.0"}' http://localhost:3000/contract-data
```

## MongoDB Connection

The API attempts to connect to MongoDB with a timeout. If the connection fails, the API will still function but won't be able to store data persistently.

## IPFS Integration

The API integrates with Pinata for IPFS pinning. When properly configured with valid Pinata API keys, JSON data sent to the `/datajson` and `/detailjson` endpoints will be pinned to IPFS, and the IPFS hash and Pinata URL will be included in the response.
