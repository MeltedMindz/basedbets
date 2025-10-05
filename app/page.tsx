'use client';

import { WalletProvider } from '@/contexts/WalletContext';
import ManagerSlotMachine from '@/components/ManagerSlotMachine';

export default function Home() {
  return (
    <WalletProvider>
      <ManagerSlotMachine />
    </WalletProvider>
  );
}