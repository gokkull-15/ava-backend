# AVA NFT API - Postman Collection

This folder contains Postman collection and environment files for testing the AVA NFT API and MetaMask integration.

## Directory Structure

```
postman/
├── README.md
├── collections/
│   └── ava-nft-collection.json
├── environments/
│   └── ava-backend-environment.json
└── scripts/
    └── nft_test_script.js
```

## Files

- `collections/ava-nft-collection.json` - Postman collection with all API endpoints
- `environments/ava-backend-environment.json` - Environment variables for the API
- `scripts/nft_test_script.js` - Test script for automating NFT API testing

## How to Use

1. Import both files into Postman
2. Select the "AVA Backend Environment" from the environment dropdown
3. Update environment variables as needed:
   - `baseUrl` - API base URL (default: production URL)
   - `localUrl` - Local development URL (disabled by default)
   - `walletAddress` - Your wallet address for testing
   - `contractAddress` - NFT contract address
   - `tokenId` - Test token ID

## API Workflow

Follow this sequence to test the complete NFT workflow:

1. **Store NFT Metadata**
   - This creates metadata and returns a `dataJsonId`
   - The response will automatically set the `dataJsonId` environment variable

2. **Get NFT Metadata**
   - Verify the metadata was stored correctly

3. **Mint NFT from Metadata**
   - Creates the NFT using the stored metadata
   - The response will set the `txHash` environment variable

4. **Get NFT Details**
   - Verify the NFT details

5. **Get Import NFT URL**
   - Get a URL to import the NFT to MetaMask

6. **Check NFT Status**
   - Check the status of the minting transaction

## Testing Scripts

The collection includes pre-request and test scripts to help automate the testing process.
You can modify these scripts to suit your specific testing needs.

## Environment Variables

- `baseUrl` - Production API base URL
- `localUrl` - Local development API base URL
- `walletAddress` - Wallet address for minting NFTs
- `contractAddress` - Smart contract address
- `tokenId` - NFT token ID for testing
- `ipfsHash` - Automatically populated when storing metadata
- `dataJsonId` - Automatically populated when storing metadata
- `txHash` - Automatically populated when minting NFT
