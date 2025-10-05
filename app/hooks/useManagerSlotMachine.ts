'use client';

import { useState, useEffect } from 'react';
import { ethers, Contract } from 'ethers';
import { useWallet } from '@/contexts/WalletContext';

// MainSlotManager Contract ABI
const MAIN_MANAGER_ABI = [
  // Read functions
  "function getManagerStats() view returns (uint256 totalVolume, uint256 totalSpins, uint256 totalJackpotWins, uint256 jackpotPool, uint256 slotMachineCount)",
  "function getSlotMachineCount() view returns (uint256)",
  "function getAllSlotMachines() view returns (address[] memory)",
  "function getSlotMachine(uint256 index) view returns (address)",
  "function isRegisteredSlotMachine(address slotMachine) view returns (bool)",
  "function jackpotPool() view returns (uint256)",
  "function houseWallet() view returns (address)",
  "function defaultJackpotPercentage() view returns (uint256)",
  "function defaultHouseEdge() view returns (uint256)",
  "function spinsPerRandomnessRefresh() view returns (uint256)",
  
  // Write functions
  "function deploySlotMachine(address pythAddress, bytes32 pythFeedId, address cloneOwner) returns (address)",
  
  // Events
  "event SlotMachineDeployed(address indexed slotMachine, address indexed owner)",
  "event JackpotDeposited(uint256 amount, address indexed slotMachine)",
  "event JackpotWon(address indexed winner, uint256 amount, address indexed slotMachine)",
  "event JackpotFunded(uint256 amount)",
];

// SlotMachine Contract ABI
const SLOT_MACHINE_ABI = [
  // Read functions
  "function getSlotMachineStats() view returns (uint256 spinCount, uint256 baseRandomness, uint256 lastRandomnessUpdate)",
  "function getValidBetAmounts() view returns (uint256[] memory)",
  "function lastSpin(address player) view returns (tuple(uint8[3] reels, uint256 payout, bool wonJackpot, uint256 timestamp, uint256 betAmount, uint256 randomSeed))",
  "function getPlayerSpinHistory(address player) view returns (tuple(uint8[3] reels, uint256 payout, bool wonJackpot, uint256 timestamp, uint256 betAmount, uint256 randomSeed)[] memory)",
  "function getPythPrice() view returns (tuple(int64 price, uint64 conf, int32 expo, uint publishTime))",
  "function symbols(uint256 index) view returns (string)",
  "function payoutConfig() view returns (tuple(uint256 threeBar, uint256 twoBar, uint256 oneBar, uint256 threeCherries, uint256 threeWatermelon, uint256 threeCoinbase))",
  "function jackpotPercentage() view returns (uint256)",
  "function houseEdge() view returns (uint256)",
  "function totalWinnings(address player) view returns (uint256)",
  
  // Write functions
  "function spin(uint256 amount)",
  "function updateRandomness()",
  
  // Events
  "event SpinExecuted(address indexed player, uint8[3] reels, uint256 payout, bool wonJackpot, uint256 betAmount, uint256 randomSeed)",
  "event RandomnessUpdated(uint256 newBaseRandomness, uint256 spinCount)",
];

// USDC ABI
const USDC_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

interface SpinResult {
  reels: number[];
  payout: string;
  wonJackpot: boolean;
  timestamp: number;
  betAmount: string;
  randomSeed: string;
}

interface ManagerStats {
  totalVolume: string;
  totalSpins: string;
  totalJackpotWins: string;
  jackpotPool: string;
  slotMachineCount: string;
}

interface SlotMachineStats {
  spinCount: string;
  baseRandomness: string;
  lastRandomnessUpdate: number;
}

interface PythPrice {
  price: string;
  conf: string;
  expo: number;
  publishTime: number;
}

interface PayoutConfig {
  threeBar: number;
  twoBar: number;
  oneBar: number;
  threeCherries: number;
  threeWatermelon: number;
  threeCoinbase: number;
}

export const useManagerSlotMachine = () => {
  const { provider, signer, account, isConnected } = useWallet();
  const [managerContract, setManagerContract] = useState<Contract | null>(null);
  const [slotMachineContract, setSlotMachineContract] = useState<Contract | null>(null);
  const [usdcContract, setUsdcContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSpin, setLastSpin] = useState<SpinResult | null>(null);
  const [spinHistory, setSpinHistory] = useState<SpinResult[]>([]);
  const [managerStats, setManagerStats] = useState<ManagerStats | null>(null);
  const [slotMachineStats, setSlotMachineStats] = useState<SlotMachineStats | null>(null);
  const [validBetAmounts, setValidBetAmounts] = useState<string[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [payoutConfig, setPayoutConfig] = useState<PayoutConfig | null>(null);
  const [pythPrice, setPythPrice] = useState<PythPrice | null>(null);
  const [userBalance, setUserBalance] = useState<string>('0');
  const [userAllowance, setUserAllowance] = useState<string>('0');
  const [userWinnings, setUserWinnings] = useState<string>('0');
  const [deployedSlotMachines, setDeployedSlotMachines] = useState<string[]>([]);

  // Contract addresses from environment
  const MANAGER_ADDRESS = process.env.NEXT_PUBLIC_MANAGER_ADDRESS || '0x0000000000000000000000000000000000000000';
  const SLOT_MACHINE_ADDRESS = process.env.NEXT_PUBLIC_SLOT_MACHINE_ADDRESS || '0x0000000000000000000000000000000000000000';
  const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

  // Initialize contracts
  useEffect(() => {
    if (provider && signer) {
      const manager = new Contract(MANAGER_ADDRESS, MAIN_MANAGER_ABI, signer);
      const slotMachine = new Contract(SLOT_MACHINE_ADDRESS, SLOT_MACHINE_ABI, signer);
      const usdc = new Contract(USDC_ADDRESS, USDC_ABI, signer);
      
      setManagerContract(manager);
      setSlotMachineContract(slotMachine);
      setUsdcContract(usdc);
    }
  }, [provider, signer]);

  // Fetch initial data
  useEffect(() => {
    if (managerContract && slotMachineContract) {
      fetchManagerData();
      fetchSlotMachineData();
    }
  }, [managerContract, slotMachineContract]);

  // Fetch user-specific data
  useEffect(() => {
    if (account && slotMachineContract && usdcContract) {
      fetchUserData();
    }
  }, [account, slotMachineContract, usdcContract]);

  const fetchManagerData = async () => {
    if (!managerContract) return;

    try {
      const [
        stats,
        slotMachineCount,
        allMachines
      ] = await Promise.all([
        managerContract.getManagerStats(),
        managerContract.getSlotMachineCount(),
        managerContract.getAllSlotMachines()
      ]);

      setManagerStats({
        totalVolume: ethers.formatUnits(stats.totalVolume, 6),
        totalSpins: stats.totalSpins.toString(),
        totalJackpotWins: stats.totalJackpotWins.toString(),
        jackpotPool: ethers.formatUnits(stats.jackpotPool, 6),
        slotMachineCount: stats.slotMachineCount.toString()
      });

      setDeployedSlotMachines(allMachines);
    } catch (err) {
      console.error('Error fetching manager data:', err);
    }
  };

  const fetchSlotMachineData = async () => {
    if (!slotMachineContract) return;

    try {
      const [
        stats,
        betAmounts,
        payoutConfigData,
        priceData
      ] = await Promise.all([
        slotMachineContract.getSlotMachineStats(),
        slotMachineContract.getValidBetAmounts(),
        slotMachineContract.payoutConfig(),
        slotMachineContract.getPythPrice()
      ]);

      // Fetch symbols
      const symbolPromises = [];
      for (let i = 0; i < 4; i++) {
        symbolPromises.push(slotMachineContract.symbols(i));
      }
      const symbolData = await Promise.all(symbolPromises);

      setSlotMachineStats({
        spinCount: stats.spinCount.toString(),
        baseRandomness: stats.baseRandomness.toString(),
        lastRandomnessUpdate: Number(stats.lastRandomnessUpdate)
      });

      setValidBetAmounts(betAmounts.map((amount: bigint) => ethers.formatUnits(amount, 6)));

      setPayoutConfig({
        threeBar: Number(payoutConfigData.threeBar),
        twoBar: Number(payoutConfigData.twoBar),
        oneBar: Number(payoutConfigData.oneBar),
        threeCherries: Number(payoutConfigData.threeCherries),
        threeWatermelon: Number(payoutConfigData.threeWatermelon),
        threeCoinbase: Number(payoutConfigData.threeCoinbase)
      });

      setSymbols(symbolData);

      setPythPrice({
        price: ethers.formatUnits(BigInt(priceData.price), -Number(priceData.expo)),
        conf: ethers.formatUnits(BigInt(priceData.conf), -Number(priceData.expo)),
        expo: Number(priceData.expo),
        publishTime: Number(priceData.publishTime)
      });
    } catch (err) {
      console.error('Error fetching slot machine data:', err);
    }
  };

  const fetchUserData = async () => {
    if (!account || !slotMachineContract || !usdcContract) return;

    try {
      const [balance, allowance, winnings, lastSpinResult, history] = await Promise.all([
        usdcContract.balanceOf(account),
        usdcContract.allowance(account, SLOT_MACHINE_ADDRESS),
        slotMachineContract.totalWinnings(account),
        slotMachineContract.lastSpin(account),
        slotMachineContract.getPlayerSpinHistory(account)
      ]);

      setUserBalance(ethers.formatUnits(balance, 6));
      setUserAllowance(ethers.formatUnits(allowance, 6));
      setUserWinnings(ethers.formatUnits(winnings, 6));

      // Set last spin if available
      if (lastSpinResult && lastSpinResult.timestamp > 0) {
        setLastSpin({
          reels: lastSpinResult.reels,
          payout: ethers.formatUnits(lastSpinResult.payout, 6),
          wonJackpot: lastSpinResult.wonJackpot,
          timestamp: Number(lastSpinResult.timestamp),
          betAmount: ethers.formatUnits(lastSpinResult.betAmount, 6),
          randomSeed: lastSpinResult.randomSeed.toString()
        });
      }

      // Set spin history
      setSpinHistory(history.map((spin: any) => ({
        reels: spin.reels,
        payout: ethers.formatUnits(spin.payout, 6),
        wonJackpot: spin.wonJackpot,
        timestamp: Number(spin.timestamp),
        betAmount: ethers.formatUnits(spin.betAmount, 6),
        randomSeed: spin.randomSeed.toString()
      })));
    } catch (err) {
      console.error('Error fetching user data:', err);
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
      const tx = await usdcContract.approve(SLOT_MACHINE_ADDRESS, amountWei);
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

  const spin = async (amount: string) => {
    if (!slotMachineContract || !account) {
      throw new Error('Wallet not connected');
    }

    setLoading(true);
    setError(null);

    try {
      const amountWei = ethers.parseUnits(amount, 6);
      
      // Check allowance
      const allowance = await usdcContract.allowance(account, SLOT_MACHINE_ADDRESS);
      if (allowance < amountWei) {
        throw new Error('Insufficient USDC allowance. Please approve USDC first.');
      }

      // Execute spin
      const tx = await slotMachineContract.spin(amountWei);
      await tx.wait();

      // Refresh data
      await Promise.all([fetchUserData(), fetchManagerData(), fetchSlotMachineData()]);

      return tx.hash;
    } catch (err: any) {
      setError(err.message || 'Spin failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateRandomness = async () => {
    if (!slotMachineContract) {
      throw new Error('Contract not connected');
    }

    setLoading(true);
    setError(null);

    try {
      const tx = await slotMachineContract.updateRandomness();
      await tx.wait();

      // Refresh slot machine data
      await fetchSlotMachineData();
    } catch (err: any) {
      setError(err.message || 'Randomness update failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deploySlotMachine = async (pythAddress: string, pythFeedId: string, owner: string) => {
    if (!managerContract) {
      throw new Error('Manager contract not connected');
    }

    setLoading(true);
    setError(null);

    try {
      const tx = await managerContract.deploySlotMachine(pythAddress, pythFeedId, owner);
      await tx.wait();

      // Refresh manager data
      await fetchManagerData();
    } catch (err: any) {
      setError(err.message || 'Slot machine deployment failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getSymbolName = (symbolIndex: number) => {
    return symbols[symbolIndex] || `Symbol ${symbolIndex}`;
  };

  const getWinningMessage = (reels: number[], payout: string, wonJackpot: boolean) => {
    if (wonJackpot) {
      return `🎉 JACKPOT! You won ${payout} USDC!`;
    }
    
    const symbolCounts = [0, 0, 0, 0]; // Count for each symbol
    reels.forEach(symbol => {
      if (symbol < 4) symbolCounts[symbol]++;
    });
    
    if (symbolCounts[0] === 3) { // 3x Bar
      return `🎯 Triple Bar! You won ${payout} USDC!`;
    } else if (symbolCounts[0] === 2) { // 2x Bar
      return `🎊 Double Bar! You won ${payout} USDC!`;
    } else if (symbolCounts[0] === 1) { // 1x Bar
      return `📈 Single Bar! You won ${payout} USDC!`;
    } else if (symbolCounts[1] === 3) { // 3x Cherries
      return `🍒 Triple Cherries! You won ${payout} USDC!`;
    } else if (symbolCounts[2] === 3) { // 3x Watermelon
      return `🍉 Triple Watermelon! You won ${payout} USDC!`;
    } else if (symbolCounts[3] === 3) { // 3x Coinbase Logo
      return `🔷 Triple Coinbase! You won ${payout} USDC!`;
    }
    
    return '💸 No winning combination. Better luck next time!';
  };

  const getPayoutMultiplier = (reels: number[]) => {
    const symbolCounts = [0, 0, 0, 0];
    reels.forEach(symbol => {
      if (symbol < 4) symbolCounts[symbol]++;
    });
    
    if (symbolCounts[0] === 3) return payoutConfig?.threeBar || 0;
    if (symbolCounts[0] === 2) return payoutConfig?.twoBar || 0;
    if (symbolCounts[0] === 1) return payoutConfig?.oneBar || 0;
    if (symbolCounts[1] === 3) return payoutConfig?.threeCherries || 0;
    if (symbolCounts[2] === 3) return payoutConfig?.threeWatermelon || 0;
    if (symbolCounts[3] === 3) return payoutConfig?.threeCoinbase || 0;
    
    return 0;
  };

  return {
    managerContract,
    slotMachineContract,
    usdcContract,
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
    deploySlotMachine,
    fetchUserData,
    fetchManagerData,
    fetchSlotMachineData,
    getSymbolName,
    getWinningMessage,
    getPayoutMultiplier,
    isReady: !!(managerContract && slotMachineContract && usdcContract && account),
  };
};
