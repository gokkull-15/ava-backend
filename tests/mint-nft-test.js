// Test script for minting NFTs with dataJsonId or ipfsHash

const axios = require('axios');

// Configuration
const API_BASE_URL = 'http://localhost:3001'; // Change to your server URL if different
const TEST_WALLET_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// Test data
const testMetadata = {
  name: 'Test NFT',
  description: 'This is a test NFT created through the API',
  image: 'https://example.com/image.png',
  attributes: [
    {
      trait_type: 'Test',
      value: 'Value'
    }
  ]
};

// Helper function to create datajson entry
async function createDataJson() {
  try {
    console.log('Creating datajson entry...');
    const response = await axios.post(`${API_BASE_URL}/datajson`, testMetadata);
    console.log('Created datajson entry:', response.data);
    return response.data.id;
  } catch (error) {
    console.error('Error creating datajson:', error.response?.data || error.message);
    throw error;
  }
}

// Test mint NFT with dataJsonId
async function testMintWithDataJsonId() {
  try {
    // Step 1: Create a datajson entry
    const dataJsonId = await createDataJson();
    if (!dataJsonId) {
      console.error('Failed to create datajson entry, cannot proceed with test');
      return;
    }
    
    // Step 2: Mint NFT with dataJsonId
    console.log(`Minting NFT with dataJsonId: ${dataJsonId}...`);
    const mintResponse = await axios.post(`${API_BASE_URL}/mint-nft`, {
      recipientAddress: TEST_WALLET_ADDRESS,
      dataJsonId: dataJsonId
    });
    
    console.log('Mint NFT Response:', JSON.stringify(mintResponse.data, null, 2));
    
    // Step 3: Check the NFT details
    if (mintResponse.data.tokenId) {
      console.log(`Checking NFT details for token ${mintResponse.data.tokenId}...`);
      const nftDetailsResponse = await axios.get(`${API_BASE_URL}/nft/${mintResponse.data.tokenId}`);
      console.log('NFT Details:', JSON.stringify(nftDetailsResponse.data, null, 2));
    }
    
    return mintResponse.data;
  } catch (error) {
    console.error('Error in testMintWithDataJsonId:', error.response?.data || error.message);
    throw error;
  }
}

// Test mint NFT with direct IPFS hash
async function testMintWithDirectIpfsHash() {
  try {
    // Step 1: Create a detailjson entry to get an IPFS hash
    console.log('Creating detailjson entry to get IPFS hash...');
    const detailJsonResponse = await axios.post(`${API_BASE_URL}/detailjson`, testMetadata);
    console.log('Created detailjson entry:', detailJsonResponse.data);
    
    const ipfsHash = detailJsonResponse.data.ipfs?.ipfsHash;
    if (!ipfsHash) {
      console.error('Failed to get IPFS hash from detailjson, cannot proceed with test');
      return;
    }
    
    // Step 2: Mint NFT with IPFS hash
    console.log(`Minting NFT with IPFS hash: ${ipfsHash}...`);
    const mintResponse = await axios.post(`${API_BASE_URL}/mint-nft`, {
      recipientAddress: TEST_WALLET_ADDRESS,
      ipfsHash: ipfsHash
    });
    
    console.log('Mint NFT Response:', JSON.stringify(mintResponse.data, null, 2));
    
    // Step 3: Check the NFT details
    if (mintResponse.data.tokenId) {
      console.log(`Checking NFT details for token ${mintResponse.data.tokenId}...`);
      const nftDetailsResponse = await axios.get(`${API_BASE_URL}/nft/${mintResponse.data.tokenId}`);
      console.log('NFT Details:', JSON.stringify(nftDetailsResponse.data, null, 2));
    }
    
    return mintResponse.data;
  } catch (error) {
    console.error('Error in testMintWithDirectIpfsHash:', error.response?.data || error.message);
    throw error;
  }
}

// Run the tests
async function runTests() {
  console.log('=== Testing NFT Minting API ===');
  console.log('\n1. Testing mint with dataJsonId:');
  try {
    await testMintWithDataJsonId();
  } catch (error) {
    console.error('Test failed:', error.message);
  }
  
  console.log('\n2. Testing mint with direct IPFS hash:');
  try {
    await testMintWithDirectIpfsHash();
  } catch (error) {
    console.error('Test failed:', error.message);
  }
  
  console.log('\n=== Tests Completed ===');
}

// Execute the tests
runTests();
