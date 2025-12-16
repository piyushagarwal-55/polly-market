# 🔍 Contract Deployment Issue Detected

## ❌ Problem: Poll Creation Failing with Unauthorized Error

### Error Details:
```
Error signature: 0x82b42900
This is: Unauthorized() error from ReputationRegistry
```

### Root Cause:
The PollFactory is trying to authorize new polls in ReputationRegistry, but it's getting `Unauthorized()` error.

This happens when:
1. `setFactory()` was never called on ReputationRegistry, OR
2. The deployment didn't complete properly

---

## ✅ How to Fix

### Option 1: Quick Fix (Recommended for Testing)

**Manually set the factory in ReputationRegistry:**

1. Go to Arbiscan: https://sepolia.arbiscan.io/address/0x032FE3F6D81a9Baca0576110090869Efe81a6AA7#writeContract

2. Connect your wallet (must be the deployer/owner)

3. Call `setFactory`:
   - `_factory`: `0xB4c9c8bFdD29Fb6c727A1fd11b769BCA1988cb4B`
   - Click "Write"

4. Confirm transaction

5. Wait for confirmation

6. Try creating a poll again!

---

### Option 2: Redeploy All Contracts (For Production)

```bash
cd contracts

# Make sure you have test ETH in your wallet
# Get from: https://faucet.quicknode.com/arbitrum/sepolia

# Deploy
forge script script/Deploy.s.sol:DeployScript --rpc-url $ARBITRUM_SEPOLIA_RPC --broadcast --verify

# Update frontend/lib/contracts.ts with new addresses
```

---

## 🔍 How to Verify if Factory is Set

1. Go to: https://sepolia.arbiscan.io/address/0x032FE3F6D81a9Baca0576110090869Efe81a6AA7#readContract

2. Call `factory()` function

3. Should return: `0xB4c9c8bFdD29Fb6c727A1fd11b769BCA1988cb4B`

4. If it returns `0x0000000000000000000000000000000000000000` → Factory not set! ❌

---

## 📋 Quick Verification Steps

```javascript
// Open browser console on the app
// Run this:

const factoryAddress = await publicClient.readContract({
  address: '0x032FE3F6D81a9Baca0576110090869Efe81a6AA7',
  abi: REPUTATION_REGISTRY_ABI,
  functionName: 'factory'
});

console.log('Factory address:', factoryAddress);
console.log('Expected:', '0xB4c9c8bFdD29Fb6c727A1fd11b769BCA1988cb4B');
console.log('Match:', factoryAddress.toLowerCase() === '0xb4c9c8bfdd29fb6c727a1fd11b769bca1988cb4b');
```

---

## 💡 Why This Happened

The deployment script (Deploy.s.sol) includes `setFactory()` call, but:

1. **Transaction might have failed** during deployment
2. **Gas ran out** before completing all steps
3. **Deployer ran script twice** with different addresses
4. **Manual deployment** skipped the setFactory step

---

## ⚡ Immediate Action

**Copy this command and run in your terminal:**

```bash
# Check if factory is set
cast call 0x032FE3F6D81a9Baca0576110090869Efe81a6AA7 "factory()(address)" --rpc-url https://sepolia.arbitrum-sep.io
```

**Expected output:** `0xB4c9c8bFdD29Fb6c727A1fd11b769BCA1988cb4B`

**If output is:** `0x0000000000000000000000000000000000000000` → **Factory NOT set!**

Then manually call `setFactory()` on Arbiscan (Option 1 above).
