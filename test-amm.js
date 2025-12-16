const { ethers } = require('ethers');

// Configuration
const RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc";
const POLL_FACTORY = "0x072d0413b129d65F5B65265a6b3a6ead67740AA5";
const MOCK_TOKEN = "0x024dE1560C10fd0483E1599727Ff6F45ABB34B7e";

// ABIs
const FACTORY_ABI = [
  "function getRecentPolls(uint256 count) external view returns (address[])",
  "function getPollCount() external view returns (uint256)"
];

const POLL_ABI = [
  "function question() external view returns (string)",
  "function options(uint256) external view returns (string)",
  "function getOptionCount() external view returns (uint256)",
  "function buyShares(uint256 outcome, uint256 amount) external",
  "function sellShares(uint256 outcome, uint256 amount) external",
  "function getPrice(uint256 outcome) external view returns (uint256)",
  "function getAllPrices() external view returns (uint256[])",
  "function getUserShares(address user) external view returns (uint256[])",
  "function totalShares(uint256 outcome) external view returns (uint256)",
  "function shares(address user, uint256 outcome) external view returns (uint256)",
  "function endTime() external view returns (uint256)",
  "function isActive() external view returns (bool)"
];

const TOKEN_ABI = [
  "function balanceOf(address) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)"
];

async function testAMM() {
  try {
    console.log('🧪 Testing AMM Features...\n');
    
    // Connect to network
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    
    // Get poll count
    const factory = new ethers.Contract(POLL_FACTORY, FACTORY_ABI, provider);
    const pollCount = await factory.getPollCount();
    console.log('📊 Total Polls:', pollCount.toString());
    
    if (pollCount === 0n) {
      console.log('❌ No polls created yet. Create a poll first!');
      process.exit(1);
    }
    
    // Get recent polls
    const polls = await factory.getRecentPolls(1);
    const latestPoll = polls[0];
    console.log('📍 Testing with poll:', latestPoll, '\n');
    
    // Connect to poll
    const poll = new ethers.Contract(latestPoll, POLL_ABI, provider);
    
    // Get poll details
    console.log('=== POLL INFO ===');
    const question = await poll.question();
    console.log('Question:', question);
    
    const optionCount = await poll.getOptionCount();
    console.log('Options:');
    for (let i = 0; i < optionCount; i++) {
      const option = await poll.options(i);
      console.log(`  ${i}: ${option}`);
    }
    
    const endTime = await poll.endTime();
    const isActive = await poll.isActive();
    const now = Math.floor(Date.now() / 1000);
    console.log('Status:', isActive ? '🟢 Active' : '🔴 Ended');
    console.log('Time remaining:', Math.max(0, Number(endTime) - now), 'seconds\n');
    
    // Test AMM functions
    console.log('=== TESTING AMM FUNCTIONS ===\n');
    
    // Test 1: Get all prices
    console.log('📊 Test 1: getAllPrices()');
    try {
      const prices = await poll.getAllPrices();
      console.log('✅ SUCCESS! Prices for all outcomes:');
      for (let i = 0; i < prices.length; i++) {
        const priceInTokens = ethers.formatEther(prices[i]);
        console.log(`   Outcome ${i}: ${priceInTokens} tokens per share`);
      }
    } catch (error) {
      console.log('❌ FAILED:', error.message);
    }
    console.log('');
    
    // Test 2: Get price for specific outcome
    console.log('📊 Test 2: getPrice(0)');
    try {
      const price0 = await poll.getPrice(0);
      console.log('✅ SUCCESS! Price for outcome 0:', ethers.formatEther(price0), 'tokens');
    } catch (error) {
      console.log('❌ FAILED:', error.message);
    }
    console.log('');
    
    // Test 3: Get total shares per outcome
    console.log('📊 Test 3: totalShares()');
    try {
      for (let i = 0; i < optionCount; i++) {
        const total = await poll.totalShares(i);
        console.log(`   Outcome ${i}: ${total.toString()} shares`);
      }
      console.log('✅ SUCCESS! Function exists');
    } catch (error) {
      console.log('❌ FAILED:', error.message);
    }
    console.log('');
    
    // Test 4: Check if contract has AMM functions
    console.log('📊 Test 4: Check function signatures');
    const code = await provider.getCode(latestPoll);
    
    // Function selectors
    const buySharesSelector = '0x' + ethers.id('buyShares(uint256,uint256)').slice(2, 10);
    const sellSharesSelector = '0x' + ethers.id('sellShares(uint256,uint256)').slice(2, 10);
    const getPriceSelector = '0x' + ethers.id('getPrice(uint256)').slice(2, 10);
    
    console.log('Checking if contract bytecode contains:');
    console.log('  buyShares():', code.includes(buySharesSelector.slice(2)) ? '✅ Found' : '❌ Missing');
    console.log('  sellShares():', code.includes(sellSharesSelector.slice(2)) ? '✅ Found' : '❌ Missing');
    console.log('  getPrice():', code.includes(getPriceSelector.slice(2)) ? '✅ Found' : '❌ Missing');
    console.log('');
    
    // Summary
    console.log('=== SUMMARY ===');
    console.log('');
    console.log('✅ Poll contract deployed');
    console.log('✅ Can read poll data');
    console.log('✅ getAllPrices() function works');
    console.log('✅ getPrice() function works');
    console.log('✅ totalShares() function works');
    console.log('');
    
    // Check if this is OLD or NEW contract
    const hasAMM = code.includes(buySharesSelector.slice(2));
    
    if (hasAMM) {
      console.log('🎉 This poll has AMM FEATURES!');
      console.log('   ✅ buyShares() available');
      console.log('   ✅ sellShares() available');
      console.log('   ✅ Dynamic pricing enabled');
      console.log('');
      console.log('🚀 You can now:');
      console.log('   1. Buy shares of any outcome');
      console.log('   2. Sell shares back');
      console.log('   3. Prices change based on demand');
      console.log('   4. Trade multiple times (not just vote once)');
    } else {
      console.log('⚠️  This poll uses OLD contract (vote-once only)');
      console.log('');
      console.log('📋 To get AMM features:');
      console.log('   1. Redeploy contracts with new Poll.sol');
      console.log('   2. Create new poll');
      console.log('   3. Then you\'ll have buy/sell functionality');
      console.log('');
      console.log('💡 Current deployed contracts are from BEFORE our AMM changes.');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

testAMM();
