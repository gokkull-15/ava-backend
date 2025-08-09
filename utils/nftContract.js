// NFT Contract Integration
const { ethers } = require('ethers');
require('dotenv').config();

// The ABI (Application Binary Interface) for our NFT contract
const nftABI = [
  "function mintWithIPFS(address recipient, string memory ipfsHash) external returns (uint256)",
  "function tokenCounter() view external returns (uint256)",
  "event NFTMinted(address indexed recipient, uint256 indexed tokenId, string tokenURI)"
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
    
    const contract = getContract();
    
    console.log(`Minting NFT for ${recipientAddress} with IPFS hash ${ipfsHash}...`);
    
    // Mint the NFT
    const tx = await contract.mintWithIPFS(recipientAddress, ipfsHash);
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    
    // Find the minted event
    const mintedEvent = receipt.logs
      .filter(log => log.topics[0] === ethers.id("NFTMinted(address,uint256,string)"))
      .map(log => contract.interface.parseLog(log))[0];
    
    if (mintedEvent) {
      return {
        success: true,
        txHash: receipt.hash,
        tokenId: mintedEvent.args.tokenId.toString(),
        recipient: mintedEvent.args.recipient,
        tokenURI: mintedEvent.args.tokenURI
      };
    }
    
    return {
      success: true,
      txHash: receipt.hash,
      message: "Transaction successful but NFTMinted event not found"
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

module.exports = {
  mintNFTWithIPFS,
  getContract
};
