const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Configuration
const RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('❌ PRIVATE_KEY environment variable not set');
  process.exit(1);
}

// Read compiled contract artifacts
function readArtifact(contractName) {
  const artifactPath = path.join(__dirname, 'contracts', 'out', `${contractName}.sol`, `${contractName}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return {
    abi: artifact.abi,
    bytecode: artifact.bytecode.object
  };
}

async function deploy() {
  try {
    console.log('🚀 Starting deployment with AMM features...\n');
    
    // Connect to network
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    console.log('📍 Deploying from:', wallet.address);
    
    const balance = await provider.getBalance(wallet.address);
    console.log('💰 Balance:', ethers.formatEther(balance), 'ETH\n');
    
    if (balance === 0n) {
      console.error('❌ No ETH balance! Get testnet ETH first.');
      process.exit(1);
    }
    
    // Load artifacts
    console.log('📦 Loading compiled contracts...');
    const MockRepToken = readArtifact('MockRepToken');
    const ReputationRegistry = readArtifact('ReputationRegistry');
    const PollFactory = readArtifact('PollFactory');
    console.log('✅ Artifacts loaded\n');
    
    // Deploy MockRepToken
    console.log('1️⃣  Deploying MockRepToken...');
    const tokenFactory = new ethers.ContractFactory(MockRepToken.abi, MockRepToken.bytecode, wallet);
    const token = await tokenFactory.deploy({
      maxFeePerGas: 100000000n,
      maxPriorityFeePerGas: 1000000n
    });
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    console.log('   ✅ MockRepToken deployed:', tokenAddress, '\n');
    
    // Deploy ReputationRegistry
    console.log('2️⃣  Deploying ReputationRegistry...');
    const registryFactory = new ethers.ContractFactory(ReputationRegistry.abi, ReputationRegistry.bytecode, wallet);
    const registry = await registryFactory.deploy({
      maxFeePerGas: 100000000n,
      maxPriorityFeePerGas: 1000000n
    });
    await registry.waitForDeployment();
    const registryAddress = await registry.getAddress();
    console.log('   ✅ ReputationRegistry deployed:', registryAddress, '\n');
    
    // Deploy PollFactory
    console.log('3️⃣  Deploying PollFactory...');
    const factoryFactory = new ethers.ContractFactory(PollFactory.abi, PollFactory.bytecode, wallet);
    const factory = await factoryFactory.deploy(registryAddress, tokenAddress, {
      maxFeePerGas: 100000000n,
      maxPriorityFeePerGas: 1000000n
    });
    await factory.waitForDeployment();
    const factoryAddress = await factory.getAddress();
    console.log('   ✅ PollFactory deployed:', factoryAddress, '\n');
    
    // Set factory in registry
    console.log('4️⃣  Setting factory in ReputationRegistry...');
    const setFactoryTx = await registry.setFactory(factoryAddress, {
      maxFeePerGas: 100000000n,
      maxPriorityFeePerGas: 1000000n
    });
    await setFactoryTx.wait();
    console.log('   ✅ Factory authorized\n');
    
    // Bootstrap reputation
    console.log('5️⃣  Bootstrapping reputation...');
    const bootstrapTx = await registry.bootstrapReputation([wallet.address], [1000], {
      maxFeePerGas: 100000000n,
      maxPriorityFeePerGas: 1000000n
    });
    await bootstrapTx.wait();
    console.log('   ✅ Deployer has 1000 reputation\n');
    
    // Print summary
    console.log('════════════════════════════════════════');
    console.log('✅ DEPLOYMENT COMPLETE WITH AMM!');
    console.log('════════════════════════════════════════\n');
    console.log('📋 Contract Addresses:');
    console.log('   MockRepToken:       ', tokenAddress);
    console.log('   ReputationRegistry: ', registryAddress);
    console.log('   PollFactory:        ', factoryAddress);
    console.log('');
    console.log('📝 Next Steps:');
    console.log('   1. Update frontend/lib/contracts.ts with these addresses');
    console.log('   2. Create a new poll to test AMM features');
    console.log('   3. Try buyShares() and sellShares()');
    console.log('');
    console.log('💡 AMM Features Included:');
    console.log('   ✅ buyShares(outcome, amount)');
    console.log('   ✅ sellShares(outcome, amount)');
    console.log('   ✅ getPrice(outcome) - dynamic pricing');
    console.log('   ✅ Unlimited trading (no AlreadyVoted error)');
    console.log('   ✅ Linear pricing: price = (totalShares + 100) / 100');
    
    // Save to file
    const config = {
      network: 'arbitrum-sepolia',
      chainId: 421614,
      deployedAt: new Date().toISOString(),
      contracts: {
        MockRepToken: tokenAddress,
        ReputationRegistry: registryAddress,
        PollFactory: factoryAddress
      },
      features: {
        amm: true,
        buyShares: true,
        sellShares: true,
        dynamicPricing: true
      }
    };
    
    fs.writeFileSync('LATEST_DEPLOYMENT_AMM.json', JSON.stringify(config, null, 2));
    console.log('\n💾 Saved to LATEST_DEPLOYMENT_AMM.json');
    
  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    if (error.data) {
      console.error('Error data:', error.data);
    }
    process.exit(1);
  }
}

deploy();
