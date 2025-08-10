// Example script for frontend MetaMask integration with the AVA NFT backend
// This can be placed in a JavaScript file on the frontend

/**
 * Connect to MetaMask
 * @returns {Promise<string>} Connected wallet address
 */
async function connectMetaMask() {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed. Please install MetaMask to continue.');
  }

  try {
    // Request account access
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts',
    });
    
    console.log('Connected wallet:', accounts[0]);
    return accounts[0];
  } catch (error) {
    console.error('Error connecting to MetaMask:', error);
    throw error;
  }
}

/**
 * Store NFT metadata on the backend
 * @param {Object} metadata - NFT metadata object
 * @returns {Promise<Object>} Response with dataJsonId and ipfsHash
 */
async function storeNFTMetadata(metadata) {
  try {
    const response = await fetch('https://ava-backend-sepia.vercel.app/api/datajson', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });
    
    return await response.json();
  } catch (error) {
    console.error('Error storing NFT metadata:', error);
    throw error;
  }
}

/**
 * Mint NFT using stored metadata
 * @param {string} walletAddress - User's wallet address
 * @param {string} dataJsonId - ID returned from storeNFTMetadata
 * @param {string} tokenId - Token ID for the NFT (optional)
 * @returns {Promise<Object>} Response with txHash and tokenId
 */
async function mintNFT(walletAddress, dataJsonId, tokenId = null) {
  try {
    const body = {
      walletAddress,
      dataJsonId,
    };
    
    if (tokenId) {
      body.tokenId = tokenId;
    }
    
    const response = await fetch('https://ava-backend-sepia.vercel.app/api/mint-nft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    return await response.json();
  } catch (error) {
    console.error('Error minting NFT:', error);
    throw error;
  }
}

/**
 * Get import URL for MetaMask
 * @param {string} tokenId - NFT token ID
 * @param {string} contractAddress - NFT contract address
 * @returns {Promise<string>} URL to import NFT to MetaMask
 */
async function getImportToMetaMaskURL(tokenId, contractAddress) {
  try {
    const response = await fetch(
      `https://ava-backend-sepia.vercel.app/api/import-to-metamask?tokenId=${tokenId}&contractAddress=${contractAddress}`
    );
    
    const data = await response.json();
    return data.url;
  } catch (error) {
    console.error('Error getting MetaMask import URL:', error);
    throw error;
  }
}

/**
 * Import NFT to MetaMask
 * @param {string} tokenId - NFT token ID
 * @param {string} contractAddress - NFT contract address
 */
async function importNFTToMetaMask(tokenId, contractAddress) {
  try {
    const importUrl = await getImportToMetaMaskURL(tokenId, contractAddress);
    
    // Open the URL in a new tab
    window.open(importUrl, '_blank');
  } catch (error) {
    console.error('Error importing NFT to MetaMask:', error);
    throw error;
  }
}

/**
 * Example usage of the complete NFT flow
 */
async function completeNFTFlow() {
  try {
    // 1. Connect to MetaMask
    const walletAddress = await connectMetaMask();
    
    // 2. Store NFT metadata
    const metadata = {
      name: 'My Awesome NFT',
      description: 'This is an awesome NFT minted through AVA',
      image: 'https://example.com/nft-image.png',
      attributes: [
        {
          trait_type: 'Background',
          value: 'Blue',
        },
        {
          trait_type: 'Character',
          value: 'Robot',
        },
      ],
    };
    
    const metadataResponse = await storeNFTMetadata(metadata);
    console.log('Stored metadata:', metadataResponse);
    
    // 3. Mint the NFT
    const mintResponse = await mintNFT(walletAddress, metadataResponse.id);
    console.log('Minted NFT:', mintResponse);
    
    // 4. Import the NFT to MetaMask
    const contractAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3'; // Example contract address
    await importNFTToMetaMask(mintResponse.tokenId, contractAddress);
    
    console.log('NFT flow complete!');
  } catch (error) {
    console.error('Error in NFT flow:', error);
  }
}

// Execute the complete flow when a button is clicked
document.getElementById('mint-nft-button')?.addEventListener('click', completeNFTFlow);
