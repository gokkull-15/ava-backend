// NFT API Testing Script for Postman
// This script can be used as a test script for the "Store NFT Metadata" request

// Test successful response
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response has data json ID", function () {
    const responseJson = pm.response.json();
    pm.expect(responseJson).to.have.property('id');
    
    // Store data json ID in environment variable for use in other requests
    if (responseJson.id) {
        pm.environment.set('dataJsonId', responseJson.id);
        console.log('Set dataJsonId to: ' + responseJson.id);
    }
});

pm.test("Response has IPFS hash", function () {
    const responseJson = pm.response.json();
    pm.expect(responseJson).to.have.property('ipfsHash');
    
    // Store IPFS hash in environment variable
    if (responseJson.ipfsHash) {
        pm.environment.set('ipfsHash', responseJson.ipfsHash);
        console.log('Set ipfsHash to: ' + responseJson.ipfsHash);
    }
});

// Test script for "Mint NFT from Metadata" request
if (pm.info.requestName === "Mint NFT from Metadata") {
    pm.test("NFT mint response contains transaction hash", function () {
        const responseJson = pm.response.json();
        pm.expect(responseJson).to.have.property('txHash');
        
        // Store transaction hash in environment variable
        if (responseJson.txHash) {
            pm.environment.set('txHash', responseJson.txHash);
            console.log('Set txHash to: ' + responseJson.txHash);
        }
    });
    
    pm.test("NFT mint response contains token ID", function () {
        const responseJson = pm.response.json();
        pm.expect(responseJson).to.have.property('tokenId');
        
        // Store token ID in environment variable
        if (responseJson.tokenId) {
            pm.environment.set('tokenId', responseJson.tokenId);
            console.log('Set tokenId to: ' + responseJson.tokenId);
        }
    });
}

// Test script for "Check NFT Status" request
if (pm.info.requestName === "Check NFT Status") {
    pm.test("NFT status response contains valid status", function () {
        const responseJson = pm.response.json();
        pm.expect(responseJson).to.have.property('status');
        pm.expect(['pending', 'confirmed', 'failed']).to.include(responseJson.status);
    });
}

// Run this in the collection's Pre-request script to generate random test data
if (pm.info.eventName === "prerequest") {
    // Generate a random token ID if none exists
    if (!pm.environment.get('tokenId')) {
        const randomTokenId = Math.floor(Math.random() * 1000000);
        pm.environment.set('tokenId', randomTokenId.toString());
        console.log('Generated random tokenId: ' + randomTokenId);
    }
}
