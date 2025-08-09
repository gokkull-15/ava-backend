// This is a simplified server-rendered NFT import page as an Express route handler
const path = require('path');

// Export the route handler function directly
module.exports = async (req, res) => {
  try {
    const { chainId, contractAddress, tokenId } = req.params;
    
    // Get network info
    let networkName = 'Sepolia Test Network';
    let networkChainId = '11155111';
    let blockExplorer = 'https://sepolia.etherscan.io';
    let openseaUrl = `https://testnets.opensea.io/assets/sepolia/${contractAddress}/${tokenId}`;
    
    // Set network info based on chain ID
    if (chainId === 'mainnet' || chainId === '1') {
      networkName = 'Ethereum Mainnet';
      networkChainId = '1';
      blockExplorer = 'https://etherscan.io';
      openseaUrl = `https://opensea.io/assets/ethereum/${contractAddress}/${tokenId}`;
    }
    
    // Get NFT details if available
    let tokenImage = '';
    let tokenName = `NFT #${tokenId}`;
    let tokenDescription = '';
    
    try {
      const { getNFTDetails } = require('../utils/nftContract');
      const nftDetails = await getNFTDetails(tokenId);
      
      // If we have metadata from the NFT details, use it
      if (nftDetails && nftDetails.metadata) {
        tokenName = nftDetails.metadata.name || tokenName;
        tokenDescription = nftDetails.metadata.description || '';
        
        if (nftDetails.metadata.image) {
          if (nftDetails.metadata.image.startsWith('ipfs://')) {
            const imageIpfsHash = nftDetails.metadata.image.replace('ipfs://', '');
            tokenImage = `https://gateway.pinata.cloud/ipfs/${imageIpfsHash}`;
          } else {
            tokenImage = nftDetails.metadata.image;
          }
        }
        
        // Use HTTP image if available
        if (nftDetails.metadata.httpImage) {
          tokenImage = nftDetails.metadata.httpImage;
        }
      }
    } catch (error) {
      console.error('Error fetching NFT metadata:', error);
      // Continue with default values
    }
    
    // Get the host for dynamic URL generation
    const host = req.get('host') || 'ava-backend-sepia.vercel.app';
    const protocol = req.protocol || 'https';
    const baseUrl = `${protocol}://${host}`;
    
    // Create a deep link for MetaMask mobile
    const deepLink = `${baseUrl}/metamask-deeplink/${chainId}/${contractAddress}/${tokenId}`;
    
    // Generate HTML directly - server-side rendered version without client-side JavaScript for MetaMask integration
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Import NFT to MetaMask</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { color: #2c3e50; border-bottom: 2px solid #3498db; }
            .box { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .btn { background: #3498db; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; }
            code { background: #e9ecef; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
            .nft-image { max-width: 300px; margin: 15px 0; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
            .metamask-button { 
                background-color: #f6851b; 
                color: white; 
                padding: 12px 24px; 
                border: none; 
                border-radius: 5px; 
                font-size: 18px; 
                cursor: pointer; 
                display: block; 
                width: 100%; 
                margin: 20px 0; 
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                text-align: center;
                font-weight: bold;
                text-decoration: none;
            }
            .metamask-button:hover { background-color: #e2761b; }
            .mobile-section { margin-top: 15px; text-align: center; }
            .mobile-link { color: #f6851b; font-weight: bold; text-decoration: none; display: inline-block; margin-top: 5px; }
        </style>
    </head>
    <body>
        <h1>${tokenName}</h1>
        
        <div class="box">
            <h2>NFT Details</h2>
            ${tokenImage ? `<img src="${tokenImage}" alt="${tokenName}" class="nft-image">` : ''}
            ${tokenDescription ? `<p>${tokenDescription}</p>` : ''}
            <p><strong>Contract Address:</strong> <code id="contractAddress">${contractAddress}</code></p>
            <p><strong>Token ID:</strong> <code id="tokenId">${tokenId}</code></p>
            <p><strong>Network:</strong> ${networkName}</p>
            <p><a href="${openseaUrl}" target="_blank" rel="noopener">View on OpenSea</a></p>
            
            <a href="${baseUrl}/mm-watch-asset.html?asset=ERC721&address=${contractAddress}&tokenId=${tokenId}&chainId=0x${parseInt(networkChainId).toString(16)}" class="metamask-button">Add to MetaMask</a>
            
            <div class="mobile-section">
              <strong>Using MetaMask Mobile?</strong>
              <br>
              <a href="${deepLink}" class="mobile-link">
                Open Directly in MetaMask Mobile App
              </a>
            </div>
        </div>
        
        <div class="box">
            <h2>Manual Import Instructions</h2>
            <ol>
                <li>Open your MetaMask wallet</li>
                <li>Click on the "NFTs" tab at the bottom</li>
                <li>Click "Import NFT"</li>
                <li>Enter the contract address: <code>${contractAddress}</code></li>
                <li>Enter the Token ID: <code>${tokenId}</code></li>
                <li>Click "Import"</li>
            </ol>
        </div>
        
        <div class="box">
            <h2>Troubleshooting</h2>
            <ul>
                <li><strong>Wrong Network</strong>: Make sure MetaMask is on the ${networkName} (Chain ID: ${networkChainId})</li>
                <li><strong>NFT Not Visible</strong>: Sometimes it takes a few minutes for the NFT to appear in your wallet</li>
                <li><strong>"Unable to verify ownership" Error</strong>: This can happen when the wallet can't verify NFT ownership. Try the manual method instead.</li>
                <li><strong>Token Standard Issue</strong>: If you're seeing errors about token standards, try the manual import method</li>
            </ul>
        </div>
    </body>
    </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Error generating NFT import page:', error);
    res.status(500).send('Error generating NFT import page: ' + error.message);
  }
};
