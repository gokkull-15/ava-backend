// NFT Contract Integration
const { ethers } = require('ethers');
require('dotenv').config();

// The ABI (Application Binary Interface) for our NFT contract
const nftABI = [
  // ERC721 Standard Interface
  "function balanceOf(address owner) view external returns (uint256)",
  "function ownerOf(uint256 tokenId) view external returns (address)",
  "function safeTransferFrom(address from, address to, uint256 tokenId) external",
  "function transferFrom(address from, address to, uint256 tokenId) external",
  "function approve(address to, uint256 tokenId) external",
  "function getApproved(uint256 tokenId) view external returns (address)",
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address owner, address operator) view external returns (bool)",
  
  // ERC721Metadata Interface
  "function name() view external returns (string memory)",
  "function symbol() view external returns (string memory)",
  "function tokenURI(uint256 tokenId) view external returns (string memory)",
  
  // Contract Specific Functions
  "function mintWithIPFS(address recipient, string memory ipfsHash) external returns (uint256)",
  "function tokenCounter() view external returns (uint256)",
  
  // Events
  "event NFTMinted(address indexed recipient, uint256 indexed tokenId, string tokenURI)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
  "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)"
];

// Contract address (replace with your deployed contract address)
// This is currently using a placeholder address
const contractAddress = process.env.NFT_CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// Initialize a provider
const getProvider = () => {
  // Try multiple RPC URLs in case one fails
  const rpcUrls = [
    process.env.SEPOLIA_RPC_URL,
    "https://eth-sepolia.public.blastapi.io",
    "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161", // Public Infura key
    "https://rpc2.sepolia.org",
    "https://rpc.sepolia.org"
  ];
  
  // Use the first available RPC URL
  for (const url of rpcUrls) {
    if (url) {
      console.log(`Trying RPC URL: ${url}`);
      return new ethers.JsonRpcProvider(url);
    }
  }
  
  // Default fallback
  return new ethers.JsonRpcProvider("https://eth-sepolia.public.blastapi.io");
};

// Create a wallet instance using the private key
const getWallet = () => {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("No private key found in environment variables");
  }
  
  const privateKey = process.env.PRIVATE_KEY;
  const provider = getProvider();
  return new ethers.Wallet(privateKey, provider);
};

// Get a contract instance
const getContract = () => {
  const wallet = getWallet();
  return new ethers.Contract(contractAddress, nftABI, wallet);
};

// Mint an NFT with IPFS hash
const mintNFTWithIPFS = async (recipientAddress, ipfsHash) => {
  try {
    // Validate input parameters
    if (!ethers.isAddress(recipientAddress)) {
      throw new Error("Invalid Ethereum address");
    }
    
    if (!ipfsHash || ipfsHash.trim() === "") {
      throw new Error("IPFS hash cannot be empty");
    }
    
    // Format the IPFS hash properly
    let formattedIpfsHash = ipfsHash;
    if (!ipfsHash.startsWith('ipfs://')) {
      formattedIpfsHash = `ipfs://${ipfsHash}`;
      console.log(`Formatted IPFS hash to: ${formattedIpfsHash}`);
    }
    
    const contract = getContract();
    
    console.log(`Minting NFT for ${recipientAddress} with IPFS hash ${formattedIpfsHash}...`);
    
    // Get the current gas price and increase it slightly to ensure the transaction goes through
    const provider = getProvider();
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice * BigInt(120) / BigInt(100); // 20% higher gas price
    
    // Mint the NFT with higher gas price for faster confirmation
    const tx = await contract.mintWithIPFS(
      recipientAddress, 
      formattedIpfsHash,
      {
        gasLimit: 300000, // Higher gas limit to ensure it completes
        gasPrice
      }
    );
    
    console.log(`Transaction sent: ${tx.hash}`);
    console.log('Waiting for transaction confirmation...');
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    
    // Try to find both NFTMinted and Transfer events
    const mintedEvent = receipt.logs
      .filter(log => log.topics[0] === ethers.id("NFTMinted(address,uint256,string)"))
      .map(log => {
        try { return contract.interface.parseLog(log); } 
        catch(e) { return null; }
      })
      .filter(Boolean)[0];
      
    const transferEvent = receipt.logs
      .filter(log => log.topics[0] === ethers.id("Transfer(address,address,uint256)"))
      .map(log => {
        try { return contract.interface.parseLog(log); } 
        catch(e) { return null; }
      })
      .filter(Boolean)[0];
    
    let tokenId = null;
    
    if (mintedEvent) {
      tokenId = mintedEvent.args.tokenId.toString();
      return {
        success: true,
        txHash: receipt.hash,
        tokenId: tokenId,
        recipient: mintedEvent.args.recipient,
        tokenURI: mintedEvent.args.tokenURI,
        blockNumber: receipt.blockNumber,
        metamaskInfo: getMetamaskInstructions(contractAddress, tokenId)
      };
    } else if (transferEvent) {
      tokenId = transferEvent.args.tokenId.toString();
      return {
        success: true,
        txHash: receipt.hash,
        tokenId: tokenId,
        recipient: transferEvent.args.to,
        transferFrom: transferEvent.args.from,
        blockNumber: receipt.blockNumber,
        metamaskInfo: getMetamaskInstructions(contractAddress, tokenId)
      };
    }
    
    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      message: "Transaction successful but NFT events not found. Check transaction on blockchain explorer."
    };
    
  } catch (error) {
    console.error("Error minting NFT:", error);
    
    // Check for common RPC errors
    let errorMessage = error.message || "Failed to mint NFT";
    
    if (errorMessage.includes("Unauthorized") || errorMessage.includes("API key")) {
      errorMessage = "RPC authentication failed. Please check your RPC URL configuration.";
    } else if (errorMessage.includes("network") || errorMessage.includes("connect")) {
      errorMessage = "Network error. Please check your internet connection and RPC URL.";
    } else if (errorMessage.includes("insufficient funds")) {
      errorMessage = "The wallet does not have enough ETH to pay for gas fees.";
    }
    
    return {
      success: false,
      error: errorMessage,
      details: error.message
    };
  }
};

// Helper function to generate MetaMask import instructions
const getMetamaskInstructions = (contractAddress, tokenId) => {
  return {
    addToMetamask: `To add this NFT to MetaMask, follow these steps:
    1. Open MetaMask and click on the 'NFTs' tab
    2. Click 'Import NFT'
    3. Enter the Contract Address: ${contractAddress}
    4. Enter the Token ID: ${tokenId}
    5. Click 'Import'`,
    networkInfo: `Make sure your MetaMask is connected to the Sepolia Test Network`,
    contractAddress: contractAddress,
    tokenId: tokenId,
    openseaUrl: `https://testnets.opensea.io/assets/sepolia/${contractAddress}/${tokenId}`
  };
};

// Function to get token URI for a specific token
const getTokenURI = async (tokenId) => {
  try {
    const contract = getContract();
    return await contract.tokenURI(tokenId);
  } catch (error) {
    console.error("Error getting token URI:", error);
    return null;
  }
};

// Function to get NFT details for a specific token
const getNFTDetails = async (tokenId) => {
  try {
    const contract = getContract();
    const owner = await contract.ownerOf(tokenId);
    const tokenURI = await contract.tokenURI(tokenId);
    
    return {
      tokenId,
      owner,
      tokenURI,
      contractAddress
    };
  } catch (error) {
    console.error(`Error getting NFT details for token ${tokenId}:`, error);
    return null;
  }
};

module.exports = {
  mintNFTWithIPFS,
  getContract,
  getTokenURI,
  getNFTDetails
};
