# PowerShell script to check if PollFactory is properly set in ReputationRegistry

Write-Host "🔍 Checking contract deployment..." -ForegroundColor Cyan
Write-Host ""

$REPUTATION_REGISTRY = "0x032FE3F6D81a9Baca0576110090869Efe81a6AA7"
$EXPECTED_FACTORY = "0xB4c9c8bFdD29Fb6c727A1fd11b769BCA1988cb4B"
$RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc"

Write-Host "Reputation Registry: $REPUTATION_REGISTRY"
Write-Host "Expected Factory: $EXPECTED_FACTORY"
Write-Host ""

# Use curl to make RPC call
$body = @{
    jsonrpc = "2.0"
    method = "eth_call"
    params = @(
        @{
            to = $REPUTATION_REGISTRY
            data = "0xc45a0155"
        },
        "latest"
    )
    id = 1
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri $RPC_URL -Method Post -Body $body -ContentType "application/json"
    $ACTUAL_FACTORY = $response.result
    
    # Convert to address format
    if ($ACTUAL_FACTORY -and $ACTUAL_FACTORY.Length -ge 66) {
        $ACTUAL_FACTORY = "0x" + $ACTUAL_FACTORY.Substring($ACTUAL_FACTORY.Length - 40)
    }
    
    Write-Host "Actual Factory in Registry: $ACTUAL_FACTORY"
    Write-Host ""
    
    if ($ACTUAL_FACTORY -eq "0x0000000000000000000000000000000000000000") {
        Write-Host "❌ PROBLEM FOUND: Factory is NOT set!" -ForegroundColor Red
        Write-Host ""
        Write-Host "🔧 TO FIX:" -ForegroundColor Yellow
        Write-Host "1. Go to: https://sepolia.arbiscan.io/address/$REPUTATION_REGISTRY#writeContract"
        Write-Host "2. Connect your wallet (must be owner/deployer)"
        Write-Host "3. Find 'setFactory' function"
        Write-Host "4. Enter _factory: $EXPECTED_FACTORY"
        Write-Host "5. Click 'Write' and confirm transaction"
        Write-Host ""
        exit 1
    }
    elseif ($ACTUAL_FACTORY.ToLower() -eq $EXPECTED_FACTORY.ToLower()) {
        Write-Host "✅ Factory is correctly set!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Poll creation should work now."
        Write-Host "If still failing, check:"
        Write-Host "- You have test ETH for gas"
        Write-Host "- You're on Arbitrum Sepolia network (Chain ID: 421614)"
        Write-Host "- Contract exists at factory address"
        exit 0
    }
    else {
        Write-Host "⚠️  WARNING: Factory is set to a DIFFERENT address!" -ForegroundColor Yellow
        Write-Host "Expected: $EXPECTED_FACTORY"
        Write-Host "Actual:   $ACTUAL_FACTORY"
        Write-Host ""
        Write-Host "This might be from an old deployment."
        Write-Host "Update frontend/lib/contracts.ts to match actual factory address."
        exit 1
    }
}
catch {
    Write-Host "❌ Error checking contract:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host ""
    Write-Host "Make sure you have internet connection and the RPC endpoint is accessible."
    exit 1
}
