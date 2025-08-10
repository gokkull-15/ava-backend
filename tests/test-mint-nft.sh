#!/bin/bash

# Simple script to test the NFT minting API

echo "Testing NFT Minting API"
echo ""

# Step 1: Create a DataJson entry
echo "Step 1: Creating DataJson entry..."
DATA_JSON_RESPONSE=$(curl -s -X POST http://localhost:3001/datajson \
  -H "Content-Type: application/json" \
  -d '{"name":"Test NFT","description":"NFT created via shell script","image":"https://example.com/image.png"}')

# Extract the ID using grep
DATA_JSON_ID=$(echo $DATA_JSON_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$DATA_JSON_ID" ]; then
  echo "Failed to get dataJsonId from response"
  echo "Response: $DATA_JSON_RESPONSE"
  exit 1
fi

echo "Created DataJson entry with ID: $DATA_JSON_ID"
echo ""

# Step 2: Mint NFT using the DataJson ID
echo "Step 2: Minting NFT with DataJson ID..."
MINT_RESPONSE=$(curl -s -X POST http://localhost:3001/mint-nft \
  -H "Content-Type: application/json" \
  -d "{\"recipientAddress\":\"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\",\"dataJsonId\":\"$DATA_JSON_ID\"}")

# Extract the token ID
TOKEN_ID=$(echo $MINT_RESPONSE | grep -o '"tokenId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN_ID" ]; then
  echo "Failed to mint NFT or get tokenId from response"
  echo "Response: $MINT_RESPONSE"
  exit 1
fi

echo "Successfully minted NFT with Token ID: $TOKEN_ID"
echo ""

# Step 3: Get NFT details
echo "Step 3: Getting NFT details..."
NFT_DETAILS=$(curl -s -X GET http://localhost:3001/nft/$TOKEN_ID)
echo "NFT Details:"
echo "$NFT_DETAILS" | python3 -m json.tool

echo ""
echo "Test completed successfully!"
