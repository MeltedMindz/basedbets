'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ethers, BrowserProvider, JsonRpcSigner } from 'ethers';

interface WalletContextType {
  account: string | null;
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  isConnected: boolean;
  chainId: number | null;
  switchToBaseSepolia: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  // Base Sepolia chain ID
  const BASE_SEPOLIA_CHAIN_ID = 84532;

  useEffect(() => {
    // Check if wallet is already connected
    if (typeof window !== 'undefined' && window.ethereum) {
      checkWalletConnection();
      setupEventListeners();
    }
  }, []);

  const checkWalletConnection = async () => {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length > 0) {
        await connectWallet();
      }
    } catch (error) {
      console.error('Error checking wallet connection:', error);
    }
  };

  const setupEventListeners = () => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
      window.ethereum.on('disconnect', handleDisconnect);
    }
  };

  const handleAccountsChanged = (accounts: string[]) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else {
      setAccount(accounts[0]);
    }
  };

  const handleChainChanged = (chainId: string) => {
    setChainId(parseInt(chainId, 16));
  };

  const handleDisconnect = () => {
    disconnectWallet();
  };

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        throw new Error('MetaMask is not installed');
      }

      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();

      setAccount(accounts[0]);
      setProvider(provider);
      setSigner(signer);
      setChainId(Number(network.chainId));

      // Check if on correct network
      if (Number(network.chainId) !== BASE_SEPOLIA_CHAIN_ID) {
        console.warn('Please switch to Base Sepolia network');
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      throw error;
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setProvider(null);
    setSigner(null);
    setChainId(null);
  };

  const switchToBaseSepolia = async () => {
    try {
      if (!window.ethereum) {
        throw new Error('MetaMask is not installed');
      }

      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x14a34' }], // Base Sepolia chain ID in hex
      });
    } catch (error: any) {
      // If the chain doesn't exist, add it
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0x14a34',
                chainName: 'Base Sepolia',
                nativeCurrency: {
                  name: 'Ether',
                  symbol: 'ETH',
                  decimals: 18,
                },
                rpcUrls: ['https://sepolia.base.org'],
                blockExplorerUrls: ['https://sepolia.basescan.org'],
              },
            ],
          });
        } catch (addError) {
          console.error('Error adding Base Sepolia network:', addError);
          throw addError;
        }
      } else {
        console.error('Error switching to Base Sepolia:', error);
        throw error;
      }
    }
  };

  const value: WalletContextType = {
    account,
    provider,
    signer,
    connectWallet,
    disconnectWallet,
    isConnected: !!account,
    chainId,
    switchToBaseSepolia,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};

// Extend Window interface for TypeScript
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, callback: (args: any) => void) => void;
      removeListener: (event: string, callback: (args: any) => void) => void;
    };
  }
}
