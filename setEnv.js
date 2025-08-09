// Helper script to check environment variables
const fs = require('fs');
const path = require('path');

console.log('Checking environment variables...');

const requiredVars = [
  'MONGODB_URI',
  'PINATA_API_KEY',
  'PINATA_SECRET_KEY',
  'JWT',
  'NFT_CONTRACT_ADDRESS',
  'SEPOLIA_RPC_URL',
  'PRIVATE_KEY'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.warn(`Warning: Missing environment variables: ${missingVars.join(', ')}`);
  console.log('Setting default values for development...');
  
  // Create a .env.production file if not exists
  const envPath = path.join(__dirname, '.env.production');
  let envContent = '';
  
  try {
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Add missing variables with placeholder values
    missingVars.forEach(varName => {
      if (!envContent.includes(`${varName}=`)) {
        switch(varName) {
          case 'NFT_CONTRACT_ADDRESS':
            envContent += `\n${varName}=0x5FbDB2315678afecb367f032d93F642f64180aa3`;
            break;
          case 'SEPOLIA_RPC_URL':
            envContent += `\n${varName}=https://eth-sepolia.public.blastapi.io`;
            break;
          case 'PRIVATE_KEY':
            envContent += `\n${varName}=af2c4a3435ba7c4bdb6d8269c00efe49826f35b46c253edeb2ceafae8cedfdc6`;
            break;
          default:
            envContent += `\n${varName}=placeholder_value_set_in_vercel_dashboard`;
        }
      }
    });
    
    fs.writeFileSync(envPath, envContent);
    console.log('Environment variables updated in .env.production');
  } catch (error) {
    console.error('Error writing environment file:', error);
  }
} else {
  console.log('All required environment variables are set!');
}

// Create a simple verification file to confirm env vars during build
const verificationContent = `
Environment variables check completed at ${new Date().toISOString()}
Status: ${missingVars.length === 0 ? 'All required variables set' : 'Missing variables: ' + missingVars.join(', ')}
`;

fs.writeFileSync(path.join(__dirname, 'env-verification.txt'), verificationContent);
console.log('Environment verification file created.');
