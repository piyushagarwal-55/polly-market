#!/bin/bash

# Script to check if PollFactory is properly set in ReputationRegistry

echo "🔍 Checking contract deployment..."
echo ""

REPUTATION_REGISTRY="0x032FE3F6D81a9Baca0576110090869Efe81a6AA7"
EXPECTED_FACTORY="0xB4c9c8bFdD29Fb6c727A1fd11b769BCA1988cb4B"
RPC_URL="https://sepolia-rollup.arbitrum.io/rpc"

echo "Reputation Registry: $REPUTATION_REGISTRY"
echo "Expected Factory: $EXPECTED_FACTORY"
echo ""

# Check factory address
ACTUAL_FACTORY=$(cast call $REPUTATION_REGISTRY "factory()(address)" --rpc-url $RPC_URL)

echo "Actual Factory in Registry: $ACTUAL_FACTORY"
echo ""

if [ "$ACTUAL_FACTORY" = "0x0000000000000000000000000000000000000000" ]; then
    echo "❌ PROBLEM FOUND: Factory is NOT set!"
    echo ""
    echo "🔧 TO FIX:"
    echo "1. Go to: https://sepolia.arbiscan.io/address/$REPUTATION_REGISTRY#writeContract"
    echo "2. Connect your wallet (must be owner/deployer)"
    echo "3. Find 'setFactory' function"
    echo "4. Enter _factory: $EXPECTED_FACTORY"
    echo "5. Click 'Write' and confirm transaction"
    echo ""
    exit 1
elif [ "${ACTUAL_FACTORY,,}" = "${EXPECTED_FACTORY,,}" ]; then
    echo "✅ Factory is correctly set!"
    echo ""
    echo "Poll creation should work now."
    echo "If still failing, check:"
    echo "- You have test ETH for gas"
    echo "- You're on Arbitrum Sepolia network"
    echo "- Contract exists at factory address"
    exit 0
else
    echo "⚠️  WARNING: Factory is set to a DIFFERENT address!"
    echo "Expected: $EXPECTED_FACTORY"
    echo "Actual:   $ACTUAL_FACTORY"
    echo ""
    echo "This might be from an old deployment."
    echo "Update frontend/lib/contracts.ts to match actual factory address."
    exit 1
fi
