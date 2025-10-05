import { ethers } from "hardhat";
import { MainSlotManager, SlotMachine } from "../typechain-types";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

// Base network configuration
const BASE_CONFIG = {
  mainnet: {
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base mainnet
    pyth: "0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a", // Pyth on Base mainnet
    pythFeedId: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", // BTC/USD on Base
    houseWallet: "0x0000000000000000000000000000000000000000", // Replace with actual house wallet
  },
  sepolia: {
    usdc: "0xfB2c4d5C96Fe9C77AE367fA5321c0015f2f49d0c", // USDC on Base Sepolia
    pyth: "0x8D254a21E612715a60b34b06a77E72F1c98b4b6A", // Pyth on Base Sepolia
    pythFeedId: "0x2b9ab1e972a281585084148ba13898010ec6d1e70abc2ca3c61d8c2d8759c5a7", // BTC/USD on Base Sepolia
    houseWallet: "0x0000000000000000000000000000000000000000", // Replace with actual house wallet
  }
};

interface DeploymentInfo {
  network: string;
  managerAddress: string;
  slotMachineImplementation: string;
  deployedSlotMachines: string[];
  usdcAddress: string;
  pythAddress: string;
  pythFeedId: string;
  houseWallet: string;
  deployer: string;
  deploymentTime: string;
  explorer: string;
  constructorArgs: any[];
}

async function main() {
  console.log("🚀 Starting MainSlotManager deployment...");

  // Get network info
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "base-sepolia" : network.name;
  console.log(`📡 Network: ${networkName} (Chain ID: ${network.chainId})`);

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`👤 Deploying with account: ${deployer.address}`);
  
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log(`💰 Account balance: ${ethers.formatEther(balance)} ETH`);

  // Get configuration for current network
  let config;
  if (networkName.includes("sepolia") || networkName.includes("testnet")) {
    config = BASE_CONFIG.sepolia;
  } else {
    config = BASE_CONFIG.mainnet;
  }

  console.log("⚙️  Using configuration:");
  console.log(`   USDC: ${config.usdc}`);
  console.log(`   Pyth: ${config.pyth}`);
  console.log(`   Pyth Feed ID: ${config.pythFeedId}`);
  console.log(`   House Wallet: ${config.houseWallet}`);

  // Deploy MainSlotManager
  console.log("\n📦 Deploying MainSlotManager...");
  const MainSlotManagerFactory = await ethers.getContractFactory("MainSlotManager");
  
  const constructorArgs = [
    config.usdc,      // USDC token address
    config.houseWallet // House wallet address
  ];

  const manager = await MainSlotManagerFactory.deploy(...constructorArgs);
  await manager.waitForDeployment();

  const managerAddress = await manager.getAddress();
  console.log(`✅ MainSlotManager deployed to: ${managerAddress}`);

  // Get slot machine implementation address
  const slotMachineImplementation = await manager.slotMachineImplementation();
  console.log(`✅ SlotMachine implementation: ${slotMachineImplementation}`);

  // Deploy multiple slot machine clones with different owners
  console.log("\n🎰 Deploying slot machine clones...");
  const deployedSlotMachines: string[] = [];

  // Deploy first clone owned by deployer
  const slotMachine1 = await manager.deployNewSlotMachine(
    config.pyth,
    config.pythFeedId,
    deployer.address
  );
  deployedSlotMachines.push(slotMachine1);
  console.log(`✅ Slot machine clone 1 deployed to: ${slotMachine1}`);

  // Deploy second clone (could be owned by different address)
  const slotMachine2 = await manager.deployNewSlotMachine(
    config.pyth,
    config.pythFeedId,
    deployer.address // Same owner for simplicity
  );
  deployedSlotMachines.push(slotMachine2);
  console.log(`✅ Slot machine clone 2 deployed to: ${slotMachine2}`);

  // Verify deployment
  console.log("\n🔍 Verifying deployment...");
  
  // Check manager configuration
  const managerStats = await manager.getManagerStats();
  console.log(`✅ Manager stats:`, {
    totalVolume: ethers.formatUnits(managerStats.totalVolume, 6),
    totalSpins: managerStats.totalSpins.toString(),
    totalJackpotWins: managerStats.totalJackpotWins.toString(),
    jackpotPool: ethers.formatUnits(managerStats.jackpotPool, 6),
    slotMachineCount: managerStats.slotMachineCount.toString()
  });

  // Check slot machine configuration
  const slotMachine = await ethers.getContractAt("SlotMachine", slotMachine1);
  const slotMachineStats = await slotMachine.getSlotMachineStats();
  const validBetAmounts = await slotMachine.getValidBetAmounts();
  
  console.log(`✅ Slot machine stats:`, {
    spinCount: slotMachineStats.spinCount.toString(),
    baseRandomness: slotMachineStats.baseRandomness.toString(),
    lastRandomnessUpdate: slotMachineStats.lastRandomnessUpdate.toString()
  });

  console.log(`✅ Valid bet amounts:`, validBetAmounts.map((amount: bigint) => 
    `${ethers.formatUnits(amount, 6)} USDC`
  ));

  // Create deployment info
  const deploymentInfo: DeploymentInfo = {
    network: networkName,
    managerAddress,
    slotMachineImplementation,
    deployedSlotMachines,
    usdcAddress: config.usdc,
    pythAddress: config.pyth,
    pythFeedId: config.pythFeedId,
    houseWallet: config.houseWallet,
    deployer: deployer.address,
    deploymentTime: new Date().toISOString(),
    explorer: `https://${networkName.includes("sepolia") ? "sepolia." : ""}basescan.org/address/${managerAddress}`,
    constructorArgs
  };

  // Save deployment info
  fs.writeFileSync(
    './deployment.json',
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\n📄 Deployment info saved to deployment.json");

  // Update environment file
  const envContent = `# MainSlotManager Deployment Configuration
NEXT_PUBLIC_MANAGER_ADDRESS=${managerAddress}
NEXT_PUBLIC_SLOT_MACHINE_ADDRESS=${slotMachine1}
NEXT_PUBLIC_USDC_ADDRESS=${config.usdc}
NEXT_PUBLIC_PYTH_ADDRESS=${config.pyth}
NEXT_PUBLIC_PYTH_FEED_ID=${config.pythFeedId}
NEXT_PUBLIC_HOUSE_WALLET=${config.houseWallet}
NEXT_PUBLIC_NETWORK=${networkName}
NEXT_PUBLIC_EXPLORER_URL=${deploymentInfo.explorer}

# Base Network RPC
NEXT_PUBLIC_RPC_URL=https://${networkName.includes("sepolia") ? "sepolia." : ""}base.org
`;

  fs.writeFileSync('./.env.local', envContent);
  console.log("📝 Environment file updated (.env.local)");

  console.log("\n🎉 Deployment completed successfully!");
  console.log("\n📋 Next steps:");
  console.log("1. Fund the manager with USDC for initial jackpot");
  console.log("2. Update house wallet address if needed");
  console.log("3. Verify contracts on BaseScan:");
  console.log(`   Manager: npx hardhat verify --network ${networkName} ${managerAddress} ${constructorArgs.map(arg => `"${arg}"`).join(' ')}`);
  console.log(`   Implementation: npx hardhat verify --network ${networkName} ${slotMachineImplementation}`);
  console.log("4. Update frontend with new contract addresses");
  console.log(`\n🔗 View Manager on BaseScan: ${deploymentInfo.explorer}`);
  console.log(`🔗 View Slot Machine 1: https://${networkName.includes("sepolia") ? "sepolia." : ""}basescan.org/address/${slotMachine1}`);
  console.log(`🔗 View Slot Machine 2: https://${networkName.includes("sepolia") ? "sepolia." : ""}basescan.org/address/${slotMachine2}`);
  
  // Test basic functionality
  console.log("\n🧪 Testing basic functionality...");
  
  try {
    // Check if slot machines are registered
    const isRegistered1 = await manager.isRegisteredSlotMachine(slotMachine1);
    const isRegistered2 = await manager.isRegisteredSlotMachine(slotMachine2);
    console.log(`✅ Slot machine 1 registered: ${isRegistered1}`);
    console.log(`✅ Slot machine 2 registered: ${isRegistered2}`);
    
    // Get slot machine count
    const count = await manager.getSlotMachineCount();
    console.log(`✅ Total slot machines: ${count}`);
    
    // Get all slot machines
    const allMachines = await manager.getAllSlotMachines();
    console.log(`✅ All slot machines: ${allMachines.join(', ')}`);
    
    // Test Pyth price on slot machine
    const pythPrice = await slotMachine.getPythPrice();
    console.log(`✅ Pyth price: $${Number(pythPrice.price) / Math.pow(10, -Number(pythPrice.expo))}`);
    
  } catch (error) {
    console.log("⚠️  Error testing functionality:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
