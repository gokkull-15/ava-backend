// Test script for minting NFT with IPFS from DataJson

// First, let's create a DataJson entry
fetch('https://ava-backend-sepia.vercel.app/datajson', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'Test NFT',
    description: 'This is a test NFT created via the mintWithIPFS function',
    image: 'https://example.com/image.png',
    attributes: [
      {
        trait_type: 'Test Trait',
        value: 'Test Value'
      }
    ]
  }),
})
.then(response => response.json())
.then(data => {
  console.log('DataJson created:', data);
  
  // Now let's mint an NFT with the dataJsonId
  if (data.id) {
    return fetch('https://ava-backend-sepia.vercel.app/mint-nft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipientAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        dataJsonId: data.id
      }),
    });
  } else {
    throw new Error('No dataJsonId returned');
  }
})
.then(response => response.json())
.then(data => {
  console.log('NFT Minting Result:', data);
  
  // If successful, let's check the NFT details
  if (data.tokenId) {
    return fetch(`https://ava-backend-sepia.vercel.app/nft/${data.tokenId}`);
  } else {
    throw new Error('No tokenId returned');
  }
})
.then(response => response.json())
.then(data => {
  console.log('NFT Details:', data);
})
.catch(error => console.error('Error:', error));
