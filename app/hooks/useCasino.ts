'use client';

import { useState, useEffect } from 'react';
import { ethers, Contract } from 'ethers';
import { useWallet } from '@/contexts/WalletContext';

// Contract ABI - simplified version for the frontend
const CASINO_ABI = [
  // Read functions
  "function jackpot() view returns (uint256)",
  "function getLastSpin(address player) view returns (uint8[3] memory symbols, uint256 payout, bool wonJackpot, uint256 timestamp)",
  "function getJackpotBalance() view returns (uint256)",
  "function totalSpins() view returns (uint256)",
  "function totalVolume() view returns (uint256)",
  "function totalWinnings(address player) view returns (uint256)",
  "function hasSpun(address player) view returns (bool)",
  
  // Write functions
  "function placeBet(uint256 amount, uint8[3] calldata serverRandoms)",
  
  // Events
  "event Spin(address indexed player, uint8[3] symbols, uint256 payout, bool jackpot, uint256 betAmount)",
  "event JackpotWon(address indexed player, uint256 amount)",
];

// USDC ABI
const USDC_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

// Contract addresses
const CASINO_ADDRESS = process.env.NEXT_PUBLIC_CASINO_ADDRESS || '0x0000000000000000000000000000000000000000';
const USDC_ADDRESS = '0xfB2c4d5C96Fe9C77AE367fA5321c0015f2f49d0c'; // Base Sepolia USDC
const RNG_SERVER_URL = process.env.NEXT_PUBLIC_RNG_SERVER_URL || 'http://localhost:3001';

interface SpinResult {
  symbols: number[];
  payout: string;
  wonJackpot: boolean;
  timestamp: number;
}

interface CasinoStats {
  jackpot: string;
  totalSpins: string;
  totalVolume: string;
}

export const useCasino = () => {
  const { provider, signer, account, isConnected } = useWallet();
  const [casinoContract, setCasinoContract] = useState<Contract | null>(null);
  const [usdcContract, setUsdcContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSpin, setLastSpin] = useState<SpinResult | null>(null);
  const [stats, setStats] = useState<CasinoStats | null>(null);
  const [userBalance, setUserBalance] = useState<string>('0');
  const [userAllowance, setUserAllowance] = useState<string>('0');
  const [userWinnings, setUserWinnings] = useState<string>('0');

  // Initialize contracts
  useEffect(() => {
    if (provider && signer) {
      const casino = new Contract(CASINO_ADDRESS, CASINO_ABI, signer);
      const usdc = new Contract(USDC_ADDRESS, USDC_ABI, signer);
      setCasinoContract(casino);
      setUsdcContract(usdc);
    }
  }, [provider, signer]);

  // Fetch user data
  useEffect(() => {
    if (account && usdcContract && casinoContract) {
      fetchUserData();
      fetchStats();
    }
  }, [account, usdcContract, casinoContract]);

  const fetchUserData = async () => {
    if (!account || !usdcContract || !casinoContract) return;

    try {
      const [balance, allowance, winnings, lastSpinResult] = await Promise.all([
        usdcContract.balanceOf(account),
        usdcContract.allowance(account, CASINO_ADDRESS),
        casinoContract.totalWinnings(account),
        casinoContract.getLastSpin(account)
      ]);

      setUserBalance(ethers.formatUnits(balance, 6)); // USDC has 6 decimals
      setUserAllowance(ethers.formatUnits(allowance, 6));
      setUserWinnings(ethers.formatUnits(winnings, 6));

      // Set last spin result if available
      if (lastSpinResult && lastSpinResult.timestamp > 0) {
        setLastSpin({
          symbols: lastSpinResult.symbols,
          payout: ethers.formatUnits(lastSpinResult.payout, 6),
          wonJackpot: lastSpinResult.wonJackpot,
          timestamp: Number(lastSpinResult.timestamp)
        });
      }
    } catch (err) {
      console.error('Error fetching user data:', err);
    }
  };

  const fetchStats = async () => {
    if (!casinoContract) return;

    try {
      const [jackpot, totalSpins, totalVolume] = await Promise.all([
        casinoContract.getJackpotBalance(),
        casinoContract.totalSpins(),
        casinoContract.totalVolume()
      ]);

      setStats({
        jackpot: ethers.formatUnits(jackpot, 6),
        totalSpins: totalSpins.toString(),
        totalVolume: ethers.formatUnits(totalVolume, 6)
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const approveUSDC = async (amount: string) => {
    if (!usdcContract || !account) {
      throw new Error('Wallet not connected');
    }

    setLoading(true);
    setError(null);

    try {
      const amountWei = ethers.parseUnits(amount, 6);
      const tx = await usdcContract.approve(CASINO_ADDRESS, amountWei);
      await tx.wait();

      // Refresh allowance
      await fetchUserData();
    } catch (err: any) {
      setError(err.message || 'Approval failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const generateRNG = async (txHash: string, playerAddress: string, blockTimestamp: number) => {
    try {
      const response = await fetch(`${RNG_SERVER_URL}/generate-rng`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          txHash,
          playerAddress,
          blockTimestamp
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate RNG');
      }

      const data = await response.json();
      return data.randoms;
    } catch (err) {
      console.error('Error generating RNG:', err);
      throw new Error('RNG generation failed');
    }
  };

  const placeBet = async (amount: string) => {
    if (!casinoContract || !account || !signer) {
      throw new Error('Wallet not connected');
    }

    setLoading(true);
    setError(null);

    try {
      const amountWei = ethers.parseUnits(amount, 6);
      
      // Check allowance
      const allowance = await usdcContract.allowance(account, CASINO_ADDRESS);
      if (allowance < amountWei) {
        throw new Error('Insufficient USDC allowance. Please approve USDC first.');
      }

      // Create a pending transaction to get the hash
      const tx = await casinoContract.placeBet.populateTransaction(amountWei, [0, 0, 0]);
      
      // Send transaction and wait for it to be mined
      const txResponse = await signer.sendTransaction(tx);
      const receipt = await txResponse.wait();

      // Generate RNG using transaction hash
      const randoms = await generateRNG(
        receipt.hash,
        account,
        Number(receipt.timestamp)
      );

      // Now send the actual bet with the generated randoms
      const betTx = await casinoContract.placeBet(amountWei, randoms);
      await betTx.wait();

      // Refresh data
      await fetchUserData();
      await fetchStats();

      return betTx.hash;
    } catch (err: any) {
      setError(err.message || 'Bet failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getWinningMessage = (symbols: number[], payout: string, wonJackpot: boolean) => {
    if (wonJackpot) {
      return `🎉 JACKPOT! You won ${payout} USDC!`;
    }
    
    if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
      return `🎯 Triple Match! You won ${payout} USDC!`;
    }
    
    if (symbols[0] === symbols[1] || symbols[0] === symbols[2] || symbols[1] === symbols[2]) {
      return `🎊 Double Match! You won ${payout} USDC!`;
    }
    
    if (symbols[0] === symbols[1] - 1 && symbols[1] === symbols[2] - 1) {
      return `📈 Sequential! You won ${payout} USDC!`;
    }
    
    return '💸 No match. Better luck next time!';
  };

  return {
    casinoContract,
    usdcContract,
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
    fetchStats,
    getWinningMessage,
    isReady: !!(casinoContract && usdcContract && account),
  };
};
