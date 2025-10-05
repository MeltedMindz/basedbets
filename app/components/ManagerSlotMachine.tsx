'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useManagerSlotMachine } from '@/hooks/useManagerSlotMachine';
import { 
  Wallet, 
  Coins, 
  Trophy, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  TrendingUp,
  Activity,
  Zap,
  Building2,
  Plus,
  Settings
} from 'lucide-react';

const ManagerSlotMachine: React.FC = () => {
  const { account, isConnected, connectWallet, chainId, switchToBaseSepolia } = useWallet();
  const {
    loading,
    error,
    lastSpin,
    spinHistory,
    managerStats,
    slotMachineStats,
    validBetAmounts,
    symbols,
    payoutConfig,
    pythPrice,
    userBalance,
    userAllowance,
    userWinnings,
    deployedSlotMachines,
    approveUSDC,
    spin,
    updateRandomness,
    isReady
  } = useManagerSlotMachine();

  const [selectedBetAmount, setSelectedBetAmount] = useState<string>('1');
  const [isSpinning, setIsSpinning] = useState(false);
  const [reels, setReels] = useState<number[]>([0, 0, 0]);
  const [showResult, setShowResult] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'play' | 'stats' | 'manager'>('play');

  // Base mainnet chain ID
  const BASE_MAINNET_CHAIN_ID = 8453;
  const BASE_SEPOLIA_CHAIN_ID = 84532;

  // Check if on correct network
  const isOnCorrectNetwork = chainId === BASE_MAINNET_CHAIN_ID || chainId === BASE_SEPOLIA_CHAIN_ID;

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (isConnected) {
        fetchUserData();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isConnected]);

  const handleConnectWallet = async () => {
    try {
      await connectWallet();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  const handleApproveUSDC = async () => {
    try {
      await approveUSDC('1000'); // Approve 1000 USDC
    } catch (error) {
      console.error('Failed to approve USDC:', error);
    }
  };

  const handleSpin = async () => {
    if (!isReady || !selectedBetAmount) return;

    setIsSpinning(true);
    setShowResult(false);
    setError(null);

    // Animate reels
    const spinDuration = 2000; // 2 seconds
    const spinInterval = 100;
    const startTime = Date.now();

    const animateReels = () => {
      if (Date.now() - startTime < spinDuration) {
        setReels([
          Math.floor(Math.random() * 4),
          Math.floor(Math.random() * 4),
          Math.floor(Math.random() * 4)
        ]);
        setTimeout(animateReels, spinInterval);
      }
    };

    animateReels();

    try {
      const txHash = await spin(selectedBetAmount);
      console.log('Spin executed:', txHash);
      
      // Show result after animation
      setTimeout(() => {
        if (lastSpin) {
          setReels(lastSpin.reels);
          setResultMessage(getWinningMessage(lastSpin.reels, lastSpin.payout, lastSpin.wonJackpot));
          setShowResult(true);
        }
        setIsSpinning(false);
      }, spinDuration + 500);
    } catch (error) {
      console.error('Failed to execute spin:', error);
      setIsSpinning(false);
      setShowResult(false);
    }
  };

  const handleUpdateRandomness = async () => {
    try {
      await updateRandomness();
    } catch (error) {
      console.error('Failed to update randomness:', error);
    }
  };

  const getSymbolColor = (symbol: number) => {
    const colors = [
      'bg-red-500',     // Bar
      'bg-green-500',   // Cherries
      'bg-blue-500',    // Watermelon
      'bg-yellow-500'   // CoinbaseLogo
    ];
    return colors[symbol] || 'bg-gray-500';
  };

  const getSymbolEmoji = (symbol: number) => {
    const emojis = ['🥃', '🍒', '🍉', '🔷']; // Bar, Cherries, Watermelon, CoinbaseLogo
    return emojis[symbol] || '❓';
  };

  const needsApproval = parseFloat(userAllowance) < parseFloat(selectedBetAmount);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <Wallet className="w-16 h-16 text-white mx-auto mb-6" />
            <h1 className="text-3xl font-bold text-white mb-4">🎰 ManagerSlot Casino</h1>
            <p className="text-gray-300 mb-6">Connect your wallet to start playing with shared jackpot pools!</p>
            <button
              onClick={handleConnectWallet}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Connect MetaMask
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isOnCorrectNetwork) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-yellow-400 mx-auto mb-6" />
            <h1 className="text-2xl font-bold text-white mb-4">Wrong Network</h1>
            <p className="text-gray-300 mb-6">
              Please switch to Base network to play.
            </p>
            <button
              onClick={switchToBaseSepolia}
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Switch to Base
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-white">🎰 ManagerSlot Casino</h1>
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span>Shared Jackpot</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span>Pyth Network</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <Building2 className="w-4 h-4 text-blue-400" />
                <span>Manager System</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-sm text-gray-300">Balance</div>
                <div className="text-white font-bold">{parseFloat(userBalance).toFixed(2)} USDC</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-300">Winnings</div>
                <div className="text-green-400 font-bold">
                  {parseFloat(userWinnings).toFixed(2)} USDC
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-300">Connected</div>
                <div className="text-white font-mono text-sm">
                  {account?.slice(0, 6)}...{account?.slice(-4)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex space-x-1 bg-white/10 backdrop-blur-lg rounded-lg p-1">
          <button
            onClick={() => setActiveTab('play')}
            className={`flex-1 py-2 px-4 rounded-md transition-colors ${
              activeTab === 'play'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            🎰 Play
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 py-2 px-4 rounded-md transition-colors ${
              activeTab === 'stats'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            📊 Statistics
          </button>
          <button
            onClick={() => setActiveTab('manager')}
            className={`flex-1 py-2 px-4 rounded-md transition-colors ${
              activeTab === 'manager'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            🏢 Manager
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pb-8">
        {activeTab === 'play' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Slot Machine */}
            <div className="lg:col-span-3">
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8">
                <h2 className="text-2xl font-bold text-white mb-6 text-center">🎰 Slot Machine</h2>
                
                {/* Reels */}
                <div className="flex justify-center space-x-4 mb-8">
                  {reels.map((symbol, index) => (
                    <div
                      key={index}
                      className={`w-24 h-24 rounded-xl ${getSymbolColor(symbol)} flex items-center justify-center text-4xl shadow-lg border-2 border-white/20`}
                    >
                      {getSymbolEmoji(symbol)}
                    </div>
                  ))}
                </div>

                {/* Result Message */}
                {showResult && resultMessage && (
                  <div className="text-center mb-6">
                    <div className="bg-white/20 backdrop-blur-lg rounded-lg p-4">
                      <p className="text-white text-lg font-semibold">{resultMessage}</p>
                    </div>
                  </div>
                )}

                {/* Bet Controls */}
                <div className="space-y-4">
                  <div className="flex flex-wrap justify-center gap-2">
                    {validBetAmounts.map((amount, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedBetAmount(amount)}
                        className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                          selectedBetAmount === amount
                            ? 'bg-blue-600 text-white'
                            : 'bg-white/20 text-gray-300 hover:bg-white/30'
                        }`}
                      >
                        {amount} USDC
                      </button>
                    ))}
                  </div>

                  {needsApproval ? (
                    <button
                      onClick={handleApproveUSDC}
                      disabled={loading}
                      className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2"
                    >
                      {loading ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-5 h-5" />
                      )}
                      <span>Approve USDC (1000 USDC)</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleSpin}
                      disabled={loading || isSpinning || parseFloat(userBalance) < parseFloat(selectedBetAmount)}
                      className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-bold py-4 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2"
                    >
                      {isSpinning ? (
                        <RefreshCw className="w-6 h-6 animate-spin" />
                      ) : (
                        <Coins className="w-6 h-6" />
                      )}
                      <span>{isSpinning ? 'Spinning...' : 'SPIN!'}</span>
                    </button>
                  )}

                  {error && (
                    <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 text-red-300">
                        <AlertCircle className="w-5 h-5" />
                        <span>{error}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stats Panel */}
            <div className="space-y-6">
              {/* Shared Jackpot */}
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
                <div className="text-center">
                  <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Shared Jackpot</h3>
                  <div className="text-3xl font-bold text-yellow-400">
                    {managerStats ? parseFloat(managerStats.jackpotPool).toFixed(2) : '0.00'} USDC
                  </div>
                  <div className="text-sm text-gray-300 mt-2">
                    Across {managerStats?.slotMachineCount || 0} machines
                  </div>
                </div>
              </div>

              {/* Pyth Price Feed */}
              {pythPrice && (
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
                  <div className="text-center">
                    <TrendingUp className="w-8 h-8 text-blue-400 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-white mb-2">Pyth BTC/USD</h3>
                    <div className="text-2xl font-bold text-blue-400">
                      ${parseFloat(pythPrice.price).toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-300 mt-1">
                      ±${parseFloat(pythPrice.conf).toFixed(2)}
                    </div>
                  </div>
                </div>
              )}

              {/* Randomness Info */}
              {slotMachineStats && (
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
                  <div className="text-center">
                    <Activity className="w-8 h-8 text-green-400 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-white mb-2">Randomness</h3>
                    <div className="text-sm text-gray-300 mb-2">
                      Spins: {slotMachineStats.spinCount}
                    </div>
                    <button
                      onClick={handleUpdateRandomness}
                      disabled={loading}
                      className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-sm py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Update</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Last Spin */}
              {lastSpin && lastSpin.timestamp > 0 && (
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
                  <h3 className="text-xl font-bold text-white mb-4">Last Spin</h3>
                  <div className="flex justify-center space-x-2 mb-4">
                    {lastSpin.reels.map((symbol, index) => (
                      <div
                        key={index}
                        className={`w-12 h-12 rounded-lg ${getSymbolColor(symbol)} flex items-center justify-center text-xl`}
                      >
                        {getSymbolEmoji(symbol)}
                      </div>
                    ))}
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-300 mb-1">Payout</div>
                    <div className="text-lg font-bold text-white">
                      {parseFloat(lastSpin.payout).toFixed(2)} USDC
                    </div>
                    {lastSpin.wonJackpot && (
                      <div className="text-yellow-400 font-bold mt-2">🎉 JACKPOT WINNER! 🎉</div>
                    )}
                  </div>
                </div>
              )}

              {/* Payout Table */}
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
                <h3 className="text-xl font-bold text-white mb-4">Payout Table</h3>
                <div className="space-y-2 text-sm text-gray-300">
                  <div className="flex justify-between">
                    <span>🥃🥃🥃 (3x Bar):</span>
                    <span className="text-white font-semibold">{payoutConfig?.threeBar ? payoutConfig.threeBar / 100 + 'x' : '15x'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>🥃🥃 (2x Bar):</span>
                    <span className="text-white font-semibold">{payoutConfig?.twoBar ? payoutConfig.twoBar / 100 + 'x' : '8x'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>🥃 (1x Bar):</span>
                    <span className="text-white font-semibold">{payoutConfig?.oneBar ? payoutConfig.oneBar / 100 + 'x' : '3x'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>🍒🍒🍒 (3x Cherries):</span>
                    <span className="text-white font-semibold">{payoutConfig?.threeCherries ? payoutConfig.threeCherries / 100 + 'x' : '6x'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>🍉🍉🍉 (3x Watermelon):</span>
                    <span className="text-white font-semibold">{payoutConfig?.threeWatermelon ? payoutConfig.threeWatermelon / 100 + 'x' : '4x'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>🔷🔷🔷 (3x Coinbase):</span>
                    <span className="text-white font-semibold">{payoutConfig?.threeCoinbase ? payoutConfig.threeCoinbase / 100 + 'x' : '12x'}</span>
                  </div>
                  <div className="text-center text-xs text-gray-400 mt-3">
                    Provably fair with Pyth Network
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Manager Statistics */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                <Building2 className="w-6 h-6 mr-2" />
                Manager Stats
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-300">Total Volume:</span>
                  <span className="text-white font-semibold">
                    {managerStats ? parseFloat(managerStats.totalVolume).toFixed(2) : '0.00'} USDC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Total Spins:</span>
                  <span className="text-white font-semibold">{managerStats?.totalSpins || '0'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Jackpot Wins:</span>
                  <span className="text-yellow-400 font-semibold">{managerStats?.totalJackpotWins || '0'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Slot Machines:</span>
                  <span className="text-white font-semibold">{managerStats?.slotMachineCount || '0'}</span>
                </div>
              </div>
            </div>

            {/* Slot Machine Statistics */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                <Activity className="w-6 h-6 mr-2" />
                Machine Stats
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-300">Machine Spins:</span>
                  <span className="text-white font-semibold">{slotMachineStats?.spinCount || '0'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Last Update:</span>
                  <span className="text-white font-semibold">
                    {slotMachineStats ? new Date(slotMachineStats.lastRandomnessUpdate * 1000).toLocaleTimeString() : 'Never'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Your Spins:</span>
                  <span className="text-white font-semibold">{spinHistory.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Your Winnings:</span>
                  <span className="text-green-400 font-semibold">
                    {parseFloat(userWinnings).toFixed(2)} USDC
                  </span>
                </div>
              </div>
            </div>

            {/* Spin History */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-4">Recent Spins</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {spinHistory.slice(-10).reverse().map((spin, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <div className="flex space-x-1">
                      {spin.reels.map((symbol, i) => (
                        <div key={i} className="text-lg">{getSymbolEmoji(symbol)}</div>
                      ))}
                    </div>
                    <div className="text-right">
                      <div className="text-gray-300">
                        {parseFloat(spin.payout).toFixed(2)} USDC
                      </div>
                      {spin.wonJackpot && (
                        <div className="text-yellow-400 text-xs">JACKPOT!</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'manager' && (
          <div className="space-y-6">
            {/* Manager Overview */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
              <h3 className="text-2xl font-bold text-white mb-6 flex items-center">
                <Building2 className="w-8 h-8 mr-3" />
                Manager System Overview
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-400 mb-2">
                    {managerStats ? parseFloat(managerStats.jackpotPool).toFixed(2) : '0.00'}
                  </div>
                  <div className="text-gray-300">Shared Jackpot (USDC)</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-400 mb-2">
                    {managerStats?.slotMachineCount || '0'}
                  </div>
                  <div className="text-gray-300">Deployed Machines</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-400 mb-2">
                    {managerStats ? parseFloat(managerStats.totalVolume).toFixed(0) : '0'}
                  </div>
                  <div className="text-gray-300">Total Volume (USDC)</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-400 mb-2">
                    {managerStats?.totalJackpotWins || '0'}
                  </div>
                  <div className="text-gray-300">Jackpot Wins</div>
                </div>
              </div>
            </div>

            {/* Deployed Slot Machines */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                <Plus className="w-6 h-6 mr-2" />
                Deployed Slot Machines
              </h3>
              <div className="space-y-2">
                {deployedSlotMachines.length > 0 ? (
                  deployedSlotMachines.map((address, index) => (
                    <div key={index} className="flex items-center justify-between bg-white/5 rounded-lg p-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <div className="text-white font-mono text-sm">
                            {address.slice(0, 6)}...{address.slice(-4)}
                          </div>
                          <div className="text-gray-400 text-xs">
                            {address === SLOT_MACHINE_ADDRESS ? 'Current Machine' : 'Other Machine'}
                          </div>
                        </div>
                      </div>
                      <div className="text-gray-300 text-sm">
                        {address === SLOT_MACHINE_ADDRESS ? (
                          <span className="text-green-400">Active</span>
                        ) : (
                          <span>Deployed</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-400 text-center py-4">
                    No slot machines deployed yet
                  </div>
                )}
              </div>
            </div>

            {/* System Information */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                <Settings className="w-6 h-6 mr-2" />
                System Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-lg font-semibold text-white mb-3">Manager Contract</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-300">Address:</span>
                      <span className="text-white font-mono">
                        {MANAGER_ADDRESS.slice(0, 6)}...{MANAGER_ADDRESS.slice(-4)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Network:</span>
                      <span className="text-white">Base {chainId === BASE_SEPOLIA_CHAIN_ID ? 'Sepolia' : 'Mainnet'}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-white mb-3">Current Machine</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-300">Address:</span>
                      <span className="text-white font-mono">
                        {SLOT_MACHINE_ADDRESS.slice(0, 6)}...{SLOT_MACHINE_ADDRESS.slice(-4)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">USDC:</span>
                      <span className="text-white font-mono">
                        {USDC_ADDRESS.slice(0, 6)}...{USDC_ADDRESS.slice(-4)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManagerSlotMachine;
