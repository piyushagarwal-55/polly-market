const { ethers } = require('ethers');

// Configuration
const REPUTATION_REGISTRY = "0x032FE3F6D81a9Baca0576110090869Efe81a6AA7";
const POLL_FACTORY = "0xB4c9c8bFdD29Fb6c727A1fd11b769BCA1988cb4B";
const RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc";

// ReputationRegistry ABI (only the functions we need)
const ABI = [
  "function setFactory(address _factory) external",
  "function factory() external view returns (address)",
  "function owner() external view returns (address)"
];

async function setFactory() {
  try {
    console.log('🔧 Setting factory in ReputationRegistry...\n');
    
    // Connect to network
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    
    // Get private key from environment variable
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      console.error('❌ ERROR: PRIVATE_KEY environment variable not set!');
      console.log('\nSet it with:');
      console.log('$env:PRIVATE_KEY = "your_private_key_here"');
      process.exit(1);
    }
    
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log('👤 Using wallet:', wallet.address);
    
    // Check balance
    const balance = await provider.getBalance(wallet.address);
    console.log('💰 Balance:', ethers.formatEther(balance), 'ETH\n');
    
    if (balance === 0n) {
      console.error('❌ No ETH for gas! Get test ETH from:');
      console.log('https://faucet.quicknode.com/arbitrum/sepolia\n');
      process.exit(1);
    }
    
    // Connect to contract
    const contract = new ethers.Contract(REPUTATION_REGISTRY, ABI, wallet);
    
    // Check current factory
    console.log('📊 Checking current factory...');
    const currentFactory = await contract.factory();
    console.log('Current factory:', currentFactory);
    console.log('Expected factory:', POLL_FACTORY);
    
    if (currentFactory.toLowerCase() === POLL_FACTORY.toLowerCase()) {
      console.log('\n✅ Factory is already set correctly!');
      process.exit(0);
    }
    
    if (currentFactory !== '0x0000000000000000000000000000000000000000') {
      console.log('\n⚠️  Factory is already set to a different address!');
      console.log('This can only be set once. Exiting...');
      process.exit(1);
    }
    
    // Call setFactory
    console.log('\n📝 Calling setFactory()...');
    const tx = await contract.setFactory(POLL_FACTORY, {
      gasLimit: 100000n
    });
    
    console.log('📤 Transaction sent:', tx.hash);
    console.log('🔗 View on Arbiscan:', `https://sepolia.arbiscan.io/tx/${tx.hash}`);
    console.log('\n⏳ Waiting for confirmation...');
    
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log('\n✅ SUCCESS! Factory has been set!');
      console.log('Transaction confirmed in block:', receipt.blockNumber);
      
      // Verify
      const newFactory = await contract.factory();
      console.log('\n📊 Verification:');
      console.log('Factory is now:', newFactory);
      console.log('Expected:', POLL_FACTORY);
      console.log('Match:', newFactory.toLowerCase() === POLL_FACTORY.toLowerCase() ? '✅' : '❌');
      
      console.log('\n🎉 Poll creation will now work!');
    } else {
      console.log('\n❌ Transaction failed!');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('Factory already set')) {
      console.log('\nThe factory has already been set. Check the current value.');
    } else if (error.message.includes('Unauthorized')) {
      console.log('\nYou are not the owner of this contract!');
      console.log('Only the deployer can call setFactory().');
    }
    
    process.exit(1);
  }
}

setFactory();
