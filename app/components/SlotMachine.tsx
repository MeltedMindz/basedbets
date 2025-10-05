'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useCasino } from '@/hooks/useCasino';
import { Wallet, Coins, Trophy, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

const SlotMachine: React.FC = () => {
  const { account, isConnected, connectWallet, chainId, switchToBaseSepolia } = useWallet();
  const {
    loading,
    error,
    lastSpin,
    stats,
    userBalance,
    userAllowance,
    userWinnings,
    approveUSDC,
    placeBet,
    fetchUserData,
    getWinningMessage,
    isReady
  } = useCasino();

  const [betAmount, setBetAmount] = useState('1');
  const [isSpinning, setIsSpinning] = useState(false);
  const [reels, setReels] = useState<number[]>([0, 0, 0]);
  const [showResult, setShowResult] = useState(false);
  const [resultMessage, setResultMessage] = useState('');

  // Check if on correct network
  const isOnBaseSepolia = chainId === 84532;

  // Auto-refresh stats every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (isConnected) {
        fetchUserData();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isConnected, fetchUserData]);

  const handleConnectWallet = async () => {
    try {
      await connectWallet();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  const handleApproveUSDC = async () => {
    try {
      await approveUSDC('100'); // Approve 100 USDC
    } catch (error) {
      console.error('Failed to approve USDC:', error);
    }
  };

  const handleSpin = async () => {
    if (!isReady || !betAmount) return;

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
          Math.floor(Math.random() * 10),
          Math.floor(Math.random() * 10),
          Math.floor(Math.random() * 10)
        ]);
        setTimeout(animateReels, spinInterval);
      }
    };

    animateReels();

    try {
      const txHash = await placeBet(betAmount);
      console.log('Bet placed:', txHash);
      
      // Show result after animation
      setTimeout(() => {
        if (lastSpin) {
          setReels(lastSpin.symbols);
          setResultMessage(getWinningMessage(lastSpin.symbols, lastSpin.payout, lastSpin.wonJackpot));
          setShowResult(true);
        }
        setIsSpinning(false);
      }, spinDuration + 500);
    } catch (error) {
      console.error('Failed to place bet:', error);
      setIsSpinning(false);
      setShowResult(false);
    }
  };

  const getReelColor = (symbol: number) => {
    const colors = [
      'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
      'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
      'bg-orange-500', 'bg-cyan-500'
    ];
    return colors[symbol] || 'bg-gray-500';
  };

  const needsApproval = parseFloat(userAllowance) < parseFloat(betAmount);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <Wallet className="w-16 h-16 text-white mx-auto mb-6" />
            <h1 className="text-3xl font-bold text-white mb-4">🎰 BaseBets Casino</h1>
            <p className="text-gray-300 mb-6">Connect your wallet to start playing the slot machine!</p>
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

  if (!isOnBaseSepolia) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-yellow-400 mx-auto mb-6" />
            <h1 className="text-2xl font-bold text-white mb-4">Wrong Network</h1>
            <p className="text-gray-300 mb-6">
              Please switch to Base Sepolia network to play.
            </p>
            <button
              onClick={switchToBaseSepolia}
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Switch to Base Sepolia
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
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-white">🎰 BaseBets Casino</h1>
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span>Base Sepolia</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-sm text-gray-300">Balance</div>
                <div className="text-white font-bold">{parseFloat(userBalance).toFixed(2)} USDC</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-300">Winnings</div>
                <div className="text-green-400 font-bold">{parseFloat(userWinnings).toFixed(2)} USDC</div>
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

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Slot Machine */}
          <div className="lg:col-span-2">
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8">
              <h2 className="text-2xl font-bold text-white mb-6 text-center">🎰 Slot Machine</h2>
              
              {/* Reels */}
              <div className="flex justify-center space-x-4 mb-8">
                {reels.map((symbol, index) => (
                  <div
                    key={index}
                    className={`w-20 h-20 rounded-xl ${getReelColor(symbol)} flex items-center justify-center text-4xl font-bold text-white shadow-lg`}
                  >
                    {symbol}
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
                <div className="flex items-center justify-center space-x-4">
                  <label className="text-white font-semibold">Bet Amount:</label>
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    min="1"
                    max="100"
                    step="1"
                    className="w-24 px-3 py-2 rounded-lg bg-white/20 text-white border border-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-white">USDC</span>
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
                    <span>Approve USDC (100 USDC)</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSpin}
                    disabled={loading || isSpinning || parseFloat(userBalance) < parseFloat(betAmount)}
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
            {/* Jackpot */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
              <div className="text-center">
                <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">Progressive Jackpot</h3>
                <div className="text-3xl font-bold text-yellow-400">
                  {stats ? parseFloat(stats.jackpot).toFixed(2) : '0.00'} USDC
                </div>
              </div>
            </div>

            {/* Game Stats */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-4">Game Statistics</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-300">Total Spins:</span>
                  <span className="text-white font-semibold">{stats?.totalSpins || '0'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Total Volume:</span>
                  <span className="text-white font-semibold">
                    {stats ? parseFloat(stats.totalVolume).toFixed(2) : '0.00'} USDC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Your Winnings:</span>
                  <span className="text-green-400 font-semibold">
                    {parseFloat(userWinnings).toFixed(2)} USDC
                  </span>
                </div>
              </div>
            </div>

            {/* Last Spin */}
            {lastSpin && lastSpin.timestamp > 0 && (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
                <h3 className="text-xl font-bold text-white mb-4">Last Spin</h3>
                <div className="flex justify-center space-x-2 mb-4">
                  {lastSpin.symbols.map((symbol, index) => (
                    <div
                      key={index}
                      className={`w-12 h-12 rounded-lg ${getReelColor(symbol)} flex items-center justify-center text-xl font-bold text-white`}
                    >
                      {symbol}
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

            {/* How to Play */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-4">How to Play</h3>
              <div className="space-y-2 text-sm text-gray-300">
                <div>• Match 3 symbols: Win the jackpot!</div>
                <div>• Match 2 symbols: Win 2x your bet</div>
                <div>• Sequential numbers: Win 0.5x your bet</div>
                <div>• No match: You lose your bet</div>
                <div>• 5% of losing bets go to jackpot</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SlotMachine;
