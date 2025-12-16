# 🔴 VERIFIED ISSUE - Factory Not Set

## ✅ VERIFICATION COMPLETE

I checked the ReputationRegistry contract and confirmed:

```
Factory in Registry: 0x0000000000000000000000000000000000000000
Expected Factory:    0xB4c9c8bFdD29Fb6c727A1fd11b769BCA1988cb4B

STATUS: ❌ FACTORY NOT SET!
```

This is **100% why** poll creation is failing with `Unauthorized()` error.

---

## 🔧 FIX REQUIRED (5 Minutes)

You need to manually call `setFactory()` on the ReputationRegistry contract.

### **STEP-BY-STEP:**

#### 1. Open Arbiscan Write Contract Page:
```
https://sepolia.arbiscan.io/address/0x032FE3F6D81a9Baca0576110090869Efe81a6AA7#writeContract
```

#### 2. Connect Wallet:
- Click "Connect to Web3" button (top of page)
- Select MetaMask
- Connect with the wallet that DEPLOYED the contracts (owner wallet)

#### 3. Find `setFactory` Function:
- Scroll down to function `4. setFactory`
- Click to expand it

#### 4. Enter Factory Address:
```
_factory (address): 0xB4c9c8bFdD29Fb6c727A1fd11b769BCA1988cb4B
```

#### 5. Submit Transaction:
- Click "Write" button
- Confirm transaction in MetaMask
- **Wait for confirmation** (10-30 seconds)

#### 6. Verify Success:
Transaction should show "Success" on Arbiscan

---

## 🎯 AFTER FIX - Verify

Run this in PowerShell to verify factory is set:

```powershell
$body = @{jsonrpc='2.0';method='eth_call';params=@(@{to='0x032FE3F6D81a9Baca0576110090869Efe81a6AA7';data='0xc45a0155'},'latest');id=1} | ConvertTo-Json; $response = Invoke-RestMethod -Uri 'https://sepolia-rollup.arbitrum.io/rpc' -Method Post -Body $body -ContentType 'application/json'; $result = '0x' + $response.result.Substring($response.result.Length - 40); Write-Host "Factory: $result"; if($result -eq '0x0000000000000000000000000000000000000000') {Write-Host "❌ Still not set" -ForegroundColor Red} else {Write-Host "✅ Factory is SET!" -ForegroundColor Green}
```

**Expected output after fix:**
```
Factory: 0xB4c9c8bFdD29Fb6c727A1fd11b769BCA1988cb4B
✅ Factory is SET!
```

---

## ✅ THEN TEST POLL CREATION

1. Hard refresh your app (Ctrl+Shift+R)
2. Try creating a poll again
3. Should work! 🎉

---

## 📸 Visual Guide

### Arbiscan Page:
![image](https://user-images.githubusercontent.com/example.png)

1. **Connect Wallet** (top right)
2. **Find function #4: setFactory**
3. **Enter address:** `0xB4c9c8bFdD29Fb6c727A1fd11b769BCA1988cb4B`
4. **Click Write**
5. **Confirm in MetaMask**

---

## ⚠️ IMPORTANT NOTES

- **You MUST use the deployer wallet** (the one that deployed contracts)
- If you're not the deployer, ask them to do this
- You need a small amount of test ETH for gas (~$0.01)
- Transaction takes 10-30 seconds to confirm

---

## 🎯 Summary

**Problem:** Factory address never got set during deployment  
**Fix:** Manually call `setFactory()` with correct address  
**Time:** 5 minutes  
**Cost:** ~0.0001 ETH gas (~$0.01 in test ETH)  

**After this fix, poll creation will work perfectly!** ✅
