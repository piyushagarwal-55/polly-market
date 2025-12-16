'use client';
import { useEffect, useState, useRef } from 'react';
import { useReadContract, useWatchContractEvent, usePublicClient } from 'wagmi';
import { POLL_ABI } from '@/lib/contracts';
import { formatEther } from 'viem';
import { TrendingUp, ZoomIn, ZoomOut, Maximize2, Download, Clock, BarChart3 } from 'lucide-react';

interface MarketChartProps {
  pollAddress: `0x${string}`;
}

interface HistoryPoint {
  timestamp: number;
  prices: number[];
  blockNumber?: bigint;
}

const formatNumber = (num: number): string => {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
  return num.toFixed(2);
};

export function MarketChart({ pollAddress }: MarketChartProps) {
  const [visibleOptions, setVisibleOptions] = useState<Set<number>>(new Set());
  const [zoomLevel, setZoomLevel] = useState(1);
  const [priceHistory, setPriceHistory] = useState<HistoryPoint[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const publicClient = usePublicClient();

  // Get options
  const { data: optionCount } = useReadContract({
    address: pollAddress,
    abi: POLL_ABI,
    functionName: 'getOptionCount',
  });

  // Build options array from option count
  const optionsArray = optionCount ? Array.from({ length: Number(optionCount) }, (_, i) => `Option ${i + 1}`) : [];

  // Get live prices with continuous polling
  const { data: pricesData, refetch: refetchPrices } = useReadContract({
    address: pollAddress,
    abi: POLL_ABI,
    functionName: 'getAllPrices',
    query: {
      enabled: !!pollAddress,
      refetchInterval: 1000, // Poll every second for updates
    },
  });

  // Convert prices to numbers
  const prices = pricesData ? pricesData.map(p => parseFloat(formatEther(p))) : [];

  // Get results (vote counts)
  const { data: resultsData, refetch: refetchResults } = useReadContract({
    address: pollAddress,
    abi: POLL_ABI,
    functionName: 'getResults',
    query: {
      refetchInterval: 1000,
      enabled: !!pollAddress,
    },
  });

  const results = resultsData || [];

  // Calculate percentages based on PRICE (Probability)
  const totalPrice = prices.reduce((sum, p) => sum + p, 0);
  const percentages = prices.map(price => {
    if (totalPrice === 0) return 0;
    return (price / totalPrice) * 100;
  });

  // Watch for events
  useWatchContractEvent({
    address: pollAddress,
    abi: POLL_ABI,
    eventName: 'VoteCast',
    onLogs: () => {
       refetchPrices();
       refetchResults();
    },
  });

  useWatchContractEvent({
    address: pollAddress,
    abi: POLL_ABI,
    eventName: 'SharesPurchased',
    onLogs: () => {
       refetchPrices();
       refetchResults();
    },
  });

  useWatchContractEvent({
    address: pollAddress,
    abi: POLL_ABI,
    eventName: 'SharesSold',
    onLogs: () => {
       refetchPrices();
       refetchResults();
    },
  });

  // Initialize visible options when we know the count
  useEffect(() => {
    if (optionCount && visibleOptions.size === 0) {
      setVisibleOptions(new Set(Array.from({ length: Number(optionCount) }, (_, i) => i)));
    }
  }, [optionCount, visibleOptions.size]);

  // Initialize with starting point
  useEffect(() => {
    if (prices.length > 0 && !isInitialized) {
      setPriceHistory([{
        timestamp: Date.now(),
        prices: [...prices]
      }]);
      setIsInitialized(true);
    }
  }, [prices, isInitialized]);

  // Track price changes and add to history
  useEffect(() => {
    if (prices.length === 0 || priceHistory.length === 0) return;

    const lastPoint = priceHistory[priceHistory.length - 1];
    
    // Check if any price has changed significantly (more than 0.0001)
    const pricesChanged = prices.some((price, idx) => 
      Math.abs(price - (lastPoint.prices[idx] || 0)) > 0.0001
    );

    if (pricesChanged) {
      setPriceHistory(prev => {
        const newPoint: HistoryPoint = {
          timestamp: Date.now(),
          prices: [...prices]
        };
        // Keep last 100 data points for detailed history
        const newHistory = [...prev, newPoint];
        return newHistory.slice(-100);
      });
    }
  }, [prices, priceHistory]);

  const getColor = (index: number) => {
    const colors = [
      { line: 'rgb(16, 185, 129)', glow: 'rgba(16, 185, 129, 0.3)', area: 'rgba(16, 185, 129, 0.1)' },
      { line: 'rgb(239, 68, 68)', glow: 'rgba(239, 68, 68, 0.3)', area: 'rgba(239, 68, 68, 0.1)' },
      { line: 'rgb(251, 191, 36)', glow: 'rgba(251, 191, 36, 0.3)', area: 'rgba(251, 191, 36, 0.1)' },
      { line: 'rgb(59, 130, 246)', glow: 'rgba(59, 130, 246, 0.3)', area: 'rgba(59, 130, 246, 0.1)' },
      { line: 'rgb(168, 85, 247)', glow: 'rgba(168, 85, 247, 0.3)', area: 'rgba(168, 85, 247, 0.1)' },
      { line: 'rgb(236, 72, 153)', glow: 'rgba(236, 72, 153, 0.3)', area: 'rgba(236, 72, 153, 0.1)' },
    ];
    return colors[index % colors.length];
  };

  const generateDataPoints = (optionIndex: number) => {
    const targetPoints = 50;
    
    if (priceHistory.length === 0) {
      return Array(targetPoints).fill(0.5);
    }

    if (priceHistory.length === 1) {
      const value = priceHistory[0].prices[optionIndex] || 0.5;
      return Array(targetPoints).fill(value);
    }

    if (priceHistory.length < targetPoints) {
      const data: number[] = [];
      const historyLength = priceHistory.length;

      for (let i = 0; i < targetPoints; i++) {
        const position = (i / (targetPoints - 1)) * (historyLength - 1);
        const lowerIndex = Math.floor(position);
        const upperIndex = Math.min(lowerIndex + 1, historyLength - 1);
        const fraction = position - lowerIndex;

        const lowerValue = priceHistory[lowerIndex].prices[optionIndex] || 0.5;
        const upperValue = priceHistory[upperIndex].prices[optionIndex] || 0.5;

        const interpolatedValue = lowerValue + (upperValue - lowerValue) * fraction;
        data.push(interpolatedValue);
      }
      return data;
    }

    const data: number[] = [];
    for (let i = 0; i < targetPoints; i++) {
      const index = Math.floor((i / (targetPoints - 1)) * (priceHistory.length - 1));
      data.push(priceHistory[index].prices[optionIndex] || 0.5);
    }
    return data;
  };

  const getChartBounds = () => {
    if (priceHistory.length === 0) return { min: 0, max: 3 };
    
    let min = Infinity;
    let max = -Infinity;

    priceHistory.forEach(point => {
      point.prices.forEach(price => {
        if (price < min) min = price;
        if (price > max) max = price;
      });
    });

    const padding = (max - min) * 0.1 || 0.5;
    return {
      min: Math.max(0, min - padding),
      max: max + padding
    };
  };

  const { min: minPrice, max: maxPrice } = getChartBounds();
  const priceRange = maxPrice - minPrice || 1;

  const downloadChart = () => {
    if (!svgRef.current) return;

    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = 'market-chart.png';
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  const toggleOption = (index: number) => {
    setVisibleOptions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const chartWidth = 800;
  const chartHeight = 300;
  const padding = 50;

  return (
    <div className="space-y-6">
      {/* Chart Area */}
      <div className="bg-slate-900/40 rounded-xl p-6 border border-slate-700/40">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-white">Market Activity</h3>
            <span className="text-xs text-slate-500">
              ({priceHistory.length} data points)
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {Array.from({ length: Number(optionCount || 3) }, (_, idx) => {
              const color = getColor(idx);
              const isVisible = visibleOptions.has(idx);
              const price = prices[idx] || 0;

              return (
                <button
                  key={idx}
                  onClick={() => toggleOption(idx)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                    isVisible
                      ? 'bg-slate-800/50 border-slate-700/60 hover:bg-slate-800/70'
                      : 'bg-slate-900/30 border-slate-800/40 opacity-50'
                  }`}
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: color.line }}
                  />
                  <span className="text-sm text-slate-300">
                    Option {idx + 1}: ${price.toFixed(3)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
              className="p-2 bg-slate-800/50 border border-slate-700/60 rounded-lg hover:bg-slate-800/70 transition-all"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4 text-slate-400" />
            </button>
            <button
              onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.25))}
              className="p-2 bg-slate-800/50 border border-slate-700/60 rounded-lg hover:bg-slate-800/70 transition-all"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4 text-slate-400" />
            </button>
            <button
              onClick={() => setZoomLevel(1)}
              className="p-2 bg-slate-800/50 border border-slate-700/60 rounded-lg hover:bg-slate-800/70 transition-all"
              title="Reset Zoom"
            >
              <Maximize2 className="w-4 h-4 text-slate-400" />
            </button>
            <button
              onClick={downloadChart}
              className="p-2 bg-slate-800/50 border border-slate-700/60 rounded-lg hover:bg-slate-800/70 transition-all"
              title="Download Chart"
            >
              <Download className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        <div ref={containerRef} className="overflow-x-auto">
          <svg
            ref={svgRef}
            width={chartWidth * zoomLevel}
            height={chartHeight}
            className="bg-slate-950/50 rounded-lg"
          >
            <defs>
              {optionsArray.map((_, idx) => {
                const color = getColor(idx);
                return (
                  <linearGradient
                    key={`gradient-${idx}`}
                    id={`gradient-${idx}`}
                    x1="0%"
                    y1="0%"
                    x2="0%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor={color.line} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={color.line} stopOpacity="0.01" />
                  </linearGradient>
                );
              })}
            </defs>

            {[0, 1, 2, 3, 4].map((i) => {
              const value = minPrice + (priceRange * i / 4);
              const yPos = padding + (chartHeight - 2 * padding) * (1 - i / 4);
              return (
                <g key={`grid-y-${i}`}>
                  <line
                    x1={padding}
                    y1={yPos}
                    x2={chartWidth - padding}
                    y2={yPos}
                    stroke="rgba(148, 163, 184, 0.1)"
                    strokeWidth="1"
                  />
                  <text
                    x={padding - 10}
                    y={yPos}
                    fill="rgba(148, 163, 184, 0.5)"
                    fontSize="11"
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    ${value.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {[0, 25, 50, 75, 100].map((x) => {
              const xPos = padding + (chartWidth - 2 * padding) * (x / 100);
              return (
                <line
                  key={`grid-x-${x}`}
                  x1={xPos}
                  y1={padding}
                  x2={xPos}
                  y2={chartHeight - padding}
                  stroke="rgba(148, 163, 184, 0.1)"
                  strokeWidth="1"
                />
              );
            })}

            {optionsArray.map((option, optionIdx) => {
              if (!visibleOptions.has(optionIdx)) return null;

              const color = getColor(optionIdx);
              const dataPoints = generateDataPoints(optionIdx);

              const pathData = dataPoints
                .map((value, i) => {
                  const x = padding + (chartWidth - 2 * padding) * (i / (dataPoints.length - 1));
                  const normalizedValue = (value - minPrice) / priceRange;
                  const y = padding + (chartHeight - 2 * padding) * (1 - normalizedValue);
                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                })
                .join(' ');

              const areaPath =
                pathData +
                ` L ${chartWidth - padding} ${chartHeight - padding}` +
                ` L ${padding} ${chartHeight - padding} Z`;

              const lastValue = dataPoints[dataPoints.length - 1];
              const lastX = chartWidth - padding;
              const normalizedLastValue = (lastValue - minPrice) / priceRange;
              const lastY = padding + (chartHeight - 2 * padding) * (1 - normalizedLastValue);

              return (
                <g key={`line-${optionIdx}`}>
                  <path d={areaPath} fill={`url(#gradient-${optionIdx})`} opacity="0.3" />
                  <path d={pathData} fill="none" stroke={color.line} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter={`drop-shadow(0 0 4px ${color.glow})`} />
                  <circle cx={lastX} cy={lastY} r="4" fill={color.line} stroke="rgba(15, 23, 42, 1)" strokeWidth="2" />
                  <text x={lastX + 8} y={lastY} fill={color.line} fontSize="11" fontWeight="600" dominantBaseline="middle">
                    ${lastValue.toFixed(3)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="flex justify-between items-center mt-3 px-12 text-xs text-slate-500">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Start</span>
          </div>
          <span>Activity</span>
          <span className="text-emerald-400 font-medium flex items-center gap-1">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
            Live
          </span>
        </div>
      </div>

      {/* Outcome Cards - MODIFIED for 2-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {optionsArray.map((_, idx) => {
          const percentage = percentages[idx] || 0;
          const currentPrice = prices[idx] || 0;
          const voteCount = results[idx] ? Number(results[idx]) : 0;
          const maxPerc = Math.max(...percentages);
          const isLeading = percentage === maxPerc && percentage > 0;
          const color = getColor(idx);
          const isVisible = visibleOptions.has(idx);

          return (
            <div
              key={idx}
              onClick={() => toggleOption(idx)}
              className={`bg-slate-900/40 hover:bg-slate-900/60 rounded-xl p-5 border transition-all cursor-pointer ${
                isLeading
                  ? 'border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                  : 'border-slate-700/40'
              } ${!isVisible ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: color.line }}
                  />
                  <h4 className="font-medium text-white">{optionsArray[idx]}</h4>
                </div>
                {isLeading && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full">
                    🏆 Leading
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <div className="text-2xl font-bold text-white">
                    ${currentPrice.toFixed(3)}
                  </div>
                  <div className="text-sm text-slate-400">
                    per share
                  </div>
                </div>

                <div className="flex justify-between items-center">
                   <div className="text-lg font-semibold text-emerald-400">
                      {percentage.toFixed(1)}%
                   </div>
                   <div className="text-sm text-slate-400 flex items-center gap-1">
                      {voteCount > 0 ? (
                        <>Votes: {formatNumber(voteCount)}</>
                      ) : (
                         <span className="text-xs opacity-50 flex items-center gap-1">
                           <BarChart3 className="w-3 h-3"/> Prob.
                         </span>
                      )}
                   </div>
                </div>
              </div>

              <div className="mt-4 bg-slate-800/50 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: color.line,
                  }}
                />
              </div>

              <div className="mt-2 text-xs text-slate-500 text-right">
                {percentage.toFixed(1)}% probability
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}