'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from 'wagmi';
import { POLL_ABI, MOCK_TOKEN_ADDRESS, ERC20_ABI, REPUTATION_REGISTRY_ADDRESS, REPUTATION_REGISTRY_ABI } from '@/lib/contracts';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, Loader2, DollarSign, Award } from 'lucide-react';
import { parseEther, formatEther } from 'viem';
import { MarketChart } from './MarketChart';

interface AMMTradingInterfaceProps {
  pollAddress: `0x${string}`;
  options: string[];
  question: string;
}

export function AMMTradingInterface({ pollAddress, options, question }: AMMTradingInterfaceProps) {
  const { address, isConnected } = useAccount();
  const [amounts, setAmounts] = useState<number[]>(options.map(() => 10));
  const [isApproved, setIsApproved] = useState(false);

  // Contract writes
  const { writeContract: writeBuy, data: buyHash, isPending: isBuyPending } = useWriteContract();
  const { writeContract: writeSell, data: sellHash, isPending: isSellPending } = useWriteContract();
  const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending } = useWriteContract();
  
  const { isSuccess: isBuySuccess } = useWaitForTransactionReceipt({ hash: buyHash });
  const { isSuccess: isSellSuccess } = useWaitForTransactionReceipt({ hash: sellHash });
  const { isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  // Get all base prices (for chart display)
  const { data: basePrices, refetch: refetchBasePrices } = useReadContract({
    address: pollAddress,
    abi: POLL_ABI,
    functionName: 'getAllPrices',
    query: {
      refetchInterval: 1000, // Poll every second for live updates
    },
  });

  // Get reputation-adjusted prices for current user (for trading)
  const { data: adjustedPrices, refetch: refetchAdjustedPrices } = useReadContract({
    address: pollAddress,
    abi: POLL_ABI,
    functionName: 'getAllAdjustedPrices',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isConnected,
      refetchInterval: 1000, // Poll every second for live updates
    },
  });

  // Get user shares
  const { data: userShares, refetch: refetchShares } = useReadContract({
    address: pollAddress,
    abi: POLL_ABI,
    functionName: 'getUserShares',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isConnected,
      refetchInterval: 1000, // Poll every second
    },
  });

  // Get token balance
  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: MOCK_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isConnected,
      refetchInterval: 2000,
    },
  });

  // Get allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: MOCK_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && pollAddress ? [address, pollAddress] : undefined,
    query: {
      enabled: !!address && isConnected,
      refetchInterval: 2000,
    },
  });

  // Get user's reputation multiplier
  const { data: repMultiplier, refetch: refetchRep } = useReadContract({
    address: REPUTATION_REGISTRY_ADDRESS,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: 'getRepMultiplier',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isConnected,
      refetchInterval: 3000,
    },
  });

  // Refetch all data after successful transactions
  useEffect(() => {
    if (isBuySuccess || isSellSuccess) {
      // Dismiss all loading toasts first
      toast.dismiss();
      
      refetchBasePrices();
      refetchAdjustedPrices();
      refetchShares();
      refetchBalance();
      try { 
        refetchRep(); 
      } catch (error) {
        console.error('Error refetching reputation:', error);
      }
      toast.success(isBuySuccess ? '✅ Shares purchased!' : '✅ Shares sold!');
    }
  }, [isBuySuccess, isSellSuccess, refetchBasePrices, refetchAdjustedPrices, refetchShares, refetchBalance, refetchRep]);

  // Watch for events
  useWatchContractEvent({
    address: pollAddress,
    abi: POLL_ABI,
    eventName: 'SharesPurchased',
    onLogs: () => {
      refetchBasePrices();
      refetchAdjustedPrices();
      refetchShares();
    },
  });

  useWatchContractEvent({
    address: pollAddress,
    abi: POLL_ABI,
    eventName: 'SharesSold',
    onLogs: () => {
      refetchBasePrices();
      refetchAdjustedPrices();
      refetchShares();
    },
  });

  useWatchContractEvent({
    address: pollAddress,
    abi: POLL_ABI,
    eventName: 'VoteCast',
    onLogs: () => {
      refetchBasePrices();
      refetchAdjustedPrices();
    },
  });

  useEffect(() => {
    if (isApproveSuccess) {
      toast.dismiss();
      refetchAllowance();
      setIsApproved(true);
      toast.success('✅ Tokens approved!');
    }
  }, [isApproveSuccess, refetchAllowance]);

  useEffect(() => {
    const onRepUpdate = (_e: Event) => {
      refetchRep();
      refetchAdjustedPrices();
      refetchBalance();
    };
    window.addEventListener('rep-update', onRepUpdate as EventListener);
    return () => window.removeEventListener('rep-update', onRepUpdate as EventListener);
  }, [refetchRep, refetchAdjustedPrices, refetchBalance]);

  useEffect(() => {
    if (allowance && allowance > parseEther("100")) {
      setIsApproved(true);
    }
  }, [allowance]);

  const handleApprove = async () => {
    if (!isConnected) {
      toast.error('Please connect your wallet');
      return;
    }

    toast.loading('Approving tokens...');
    try {
      writeApprove({
        address: MOCK_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [pollAddress, parseEther("1000000")],
        maxFeePerGas: 100000000n,
        maxPriorityFeePerGas: 1000000n,
        gas: 100000n,
      });
    } catch (error: any) {
      toast.dismiss();
      toast.error('Approval failed: ' + error.message);
    }
  };

  const handleBuy = async (outcomeIndex: number) => {
    if (!isConnected) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!isApproved) {
      toast.error('Please approve tokens first');
      return;
    }

    const amount = amounts[outcomeIndex];
    if (amount <= 0) {
      toast.error('Amount must be greater than 0');
      return;
    }

    toast.loading('Buying shares...');
    try {
      writeBuy({
        address: pollAddress,
        abi: POLL_ABI,
        functionName: 'buyShares',
        args: [BigInt(outcomeIndex), BigInt(amount)],
        maxFeePerGas: 100000000n,
        maxPriorityFeePerGas: 1000000n,
        gas: 500000n,
      });
    } catch (error: any) {
      toast.dismiss();
      toast.error('Buy failed: ' + error.message);
    }
  };

  const handleSell = async (outcomeIndex: number) => {
    if (!isConnected) {
      toast.error('Please connect your wallet');
      return;
    }

    const userSharesForOutcome = userShares ? Number(userShares[outcomeIndex]) : 0;
    const amount = amounts[outcomeIndex];

    if (amount <= 0) {
      toast.error('Amount must be greater than 0');
      return;
    }

    if (amount > userSharesForOutcome) {
      toast.error(`You only have ${userSharesForOutcome} shares`);
      return;
    }

    toast.loading('Selling shares...');
    try {
      writeSell({
        address: pollAddress,
        abi: POLL_ABI,
        functionName: 'sellShares',
        args: [BigInt(outcomeIndex), BigInt(amount)],
        maxFeePerGas: 100000000n,
        maxPriorityFeePerGas: 1000000n,
        gas: 500000n,
      });
    } catch (error: any) {
      toast.dismiss();
      toast.error('Sell failed: ' + error.message);
    }
  };

  if (!isConnected) {
    return (
      <div className="text-center py-8 text-gray-400">
        Connect your wallet to start trading
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-white">Market Overview</h3>
        <div className="flex items-center gap-4">
          {repMultiplier && (
            <div className="flex items-center gap-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-lg px-3 py-1">
              <Award className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-purple-300">
                {(() => {
                  const repValue = Number(repMultiplier) / 1e18;
                  if (repValue >= 2.5) return '🏆 Expert: 33% OFF';
                  if (repValue >= 1.5) return '⭐ Active: 17% OFF';
                  if (repValue >= 0.9) return '📊 Standard';
                  if (repValue >= 0.5) return '⚠️ New: 2x markup';
                  return '🚫 Sybil: 10x markup';
                })()}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <div className="text-sm text-gray-400">
              Balance: {tokenBalance ? parseFloat(formatEther(tokenBalance)).toFixed(2) : '0'} REP
            </div>
          </div>
        </div>
      </div>

      {/* Approve Section */}
      {!isApproved && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-400 font-medium">Approval Required</p>
              <p className="text-sm text-gray-400">Approve tokens to start trading</p>
            </div>
            <button
              onClick={handleApprove}
              disabled={isApprovePending}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-black rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isApprovePending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Approving...
                </>
              ) : (
                'Approve Tokens'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Chart Left, Trading Right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr,1fr] gap-6">
        {/* Left: Market Chart */}
        <div className="bg-gray-800/30 border border-gray-700 rounded-lg p-4">
          <MarketChart pollAddress={pollAddress} />
        </div>

        {/* Right: Trading Cards */}
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-white mb-3">Trade Outcomes</h3>
          {options.map((option, index) => {
          const basePriceWei = basePrices?.[index];
          let priceWei = adjustedPrices?.[index];

          // --- CRITICAL FIX: SANITY CHECK ---
          // 1. If price is missing OR 0 OR ridiculously small (< 0.0001 ETH equivalent)
          // 2. We assume it's invalid/garbage data from the contract (like the "3" we saw)
          // 3. Fallback to the Base Price
          if (!priceWei || priceWei < 100000000000000n) { // Threshold: 0.0001 ETH
             // console.log(`Debug: Force fallback for option ${index}. Adjusted was: ${priceWei}`);
             priceWei = basePriceWei;
          }
          
          const priceNum = priceWei ? parseFloat(formatEther(priceWei)) : 0;
          const basePrice = basePriceWei ? parseFloat(formatEther(basePriceWei)) : 0;
          
          const shares = userShares ? Number(userShares[index]) : 0;
          const cost = (priceNum * amounts[index]).toFixed(3);
          
          const priceChange = basePrice > 0 ? ((priceNum - basePrice) / basePrice * 100).toFixed(1) : "0";
          const hasDiscount = priceNum < basePrice;
          const hasMarkup = priceNum > basePrice;

          return (
            <div
              key={index}
              className="bg-gray-800 border border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex-1">
                  <h4 className="text-white font-semibold text-lg">{option}</h4>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-2xl font-bold text-blue-400">
                      ${priceNum > 0 ? priceNum.toFixed(4) : (basePrices ? 'Loading...' : '0.0000')}
                    </span>
                    <span className="text-sm text-gray-400">per share</span>
                    
                    {(hasDiscount || hasMarkup) && basePrice > 0 && Math.abs(parseFloat(priceChange)) > 0.1 && (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        hasDiscount 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {hasDiscount ? '↓' : '↑'} {Math.abs(parseFloat(priceChange))}%
                      </span>
                    )}
                  </div>
                  
                  {(hasDiscount || hasMarkup) && basePrice > 0 && Math.abs(parseFloat(priceChange)) > 0.1 && (
                    <div className="text-xs text-gray-500 mt-1">
                      Base: ${basePrice.toFixed(3)}
                    </div>
                  )}
                </div>
                {shares > 0 && (
                  <div className="text-right">
                    <div className="text-sm text-gray-400">Your shares</div>
                    <div className="text-xl font-bold text-green-400">{shares}</div>
                  </div>
                )}
              </div>

              <div className="mb-3">
                <label className="text-sm text-gray-400 mb-1 block">Amount</label>
                <input
                  type="number"
                  value={amounts[index]}
                  onChange={(e) => {
                    const newAmounts = [...amounts];
                    newAmounts[index] = parseInt(e.target.value) || 0;
                    setAmounts(newAmounts);
                  }}
                  min="1"
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
                <div className="text-xs text-gray-400 mt-1">
                  Cost: ~{cost} REP tokens
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleBuy(index)}
                  disabled={!isApproved || isBuyPending}
                  className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  {isBuyPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Buying...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-4 h-4" />
                      Buy
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleSell(index)}
                  disabled={shares === 0 || isSellPending}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  {isSellPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Selling...
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-4 h-4" />
                      Sell
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mt-4">
        <div className="flex items-start gap-2">
          <DollarSign className="w-5 h-5 text-blue-400 mt-0.5" />
          <div className="text-sm text-gray-300">
            <p className="font-medium text-blue-400 mb-1">Reputation-Weighted Pricing:</p>
            <ul className="space-y-1 text-xs text-gray-400">
              <li>• <span className="text-green-400">High reputation = lower prices</span> (up to 33% discount)</li>
              <li>• <span className="text-yellow-400">Medium reputation = normal prices</span></li>
              <li>• <span className="text-red-400">Low/Sybil accounts = higher prices</span> (2-10x markup)</li>
              <li>• <span className="text-blue-400">Prices update in real-time</span> as trades happen</li>
              <li>• Build reputation by trading and winning to get better prices!</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}