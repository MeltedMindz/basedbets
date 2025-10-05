import { ethers } from "hardhat";
import { MainSlotManager } from "../typechain-types";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

// Base network configuration
const BASE_CONFIG = {
  mainnet: {
    pyth: "0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a", // Pyth on Base mainnet
    pythFeedId: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", // BTC/USD on Base
  },
  sepolia: {
    pyth: "0x8D254a21E612715a60b34b06a77E72F1c98b4b6A", // Pyth on Base Sepolia
    pythFeedId: "0x2b9ab1e972a281585084148ba13898010ec6d1e70abc2ca3c61d8c2d8759c5a7", // BTC/USD on Base Sepolia
  }
};

interface SlotMachineDeploymentInfo {
  network: string;
  managerAddress: string;
  slotMachineAddress: string;
  owner: string;
  pythAddress: string;
  pythFeedId: string;
  deployer: string;
  deploymentTime: string;
  explorer: string;
}

async function main() {
  console.log("🎰 Starting Slot Machine deployment...");

  // Check if deployment.json exists
  if (!fs.existsSync('./deployment.json')) {
    console.error("❌ deployment.json not found. Please deploy MainSlotManager first.");
    process.exit(1);
  }

  const managerDeployment = JSON.parse(fs.readFileSync('./deployment.json', 'utf8'));
  
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
  console.log(`   Manager: ${managerDeployment.managerAddress}`);
  console.log(`   Pyth: ${config.pyth}`);
  console.log(`   Pyth Feed ID: ${config.pythFeedId}`);

  // Get the manager contract
  const manager = await ethers.getContractAt("MainSlotManager", managerDeployment.managerAddress);

  // Check if deployer is owner
  const owner = await manager.owner();
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.error("❌ Only the manager owner can deploy slot machines");
    console.log(`   Manager owner: ${owner}`);
    console.log(`   Your address: ${deployer.address}`);
    process.exit(1);
  }

  // Deploy slot machine clone
  console.log("\n🎰 Deploying slot machine clone...");
  const slotMachineAddress = await manager.deploySlotMachine(
    config.pyth,
    config.pythFeedId,
    deployer.address // Owner of the slot machine
  );

  console.log(`✅ Slot machine clone deployed to: ${slotMachineAddress}`);

  // Verify deployment
  console.log("\n🔍 Verifying deployment...");
  
  // Check if slot machine is registered
  const isRegistered = await manager.isRegisteredSlotMachine(slotMachineAddress);
  console.log(`✅ Slot machine registered: ${isRegistered}`);

  // Get updated manager stats
  const managerStats = await manager.getManagerStats();
  console.log(`✅ Manager stats:`, {
    totalVolume: ethers.formatUnits(managerStats.totalVolume, 6),
    totalSpins: managerStats.totalSpins.toString(),
    totalJackpotWins: managerStats.totalJackpotWins.toString(),
    jackpotPool: ethers.formatUnits(managerStats.jackpotPool, 6),
    slotMachineCount: managerStats.slotMachineCount.toString()
  });

  // Check slot machine configuration
  const slotMachine = await ethers.getContractAt("SlotMachine", slotMachineAddress);
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

  // Update deployment info
  const updatedDeployment = {
    ...managerDeployment,
    deployedSlotMachines: [...managerDeployment.deployedSlotMachines, slotMachineAddress]
  };

  fs.writeFileSync(
    './deployment.json',
    JSON.stringify(updatedDeployment, null, 2)
  );
  console.log("\n📄 Updated deployment.json");

  // Create slot machine deployment info
  const slotMachineDeployment: SlotMachineDeploymentInfo = {
    network: networkName,
    managerAddress: managerDeployment.managerAddress,
    slotMachineAddress,
    owner: deployer.address,
    pythAddress: config.pyth,
    pythFeedId: config.pythFeedId,
    deployer: deployer.address,
    deploymentTime: new Date().toISOString(),
    explorer: `https://${networkName.includes("sepolia") ? "sepolia." : ""}basescan.org/address/${slotMachineAddress}`
  };

  // Save slot machine deployment info
  fs.writeFileSync(
    './slot-machine-deployment.json',
    JSON.stringify(slotMachineDeployment, null, 2)
  );
  console.log("📄 Slot machine deployment info saved to slot-machine-deployment.json");

  console.log("\n🎉 Slot machine deployment completed successfully!");
  console.log("\n📋 Next steps:");
  console.log("1. Fund the manager with USDC for initial jackpot");
  console.log("2. Test the slot machine functionality");
  console.log("3. Verify slot machine clone on BaseScan (if needed)");
  console.log(`\n🔗 View Slot Machine: ${slotMachineDeployment.explorer}`);
  console.log(`🔗 View Manager: https://${networkName.includes("sepolia") ? "sepolia." : ""}basescan.org/address/${managerDeployment.managerAddress}`);
  
  // Test basic functionality
  console.log("\n🧪 Testing slot machine functionality...");
  
  try {
    // Check Pyth price
    const pythPrice = await slotMachine.getPythPrice();
    console.log(`✅ Pyth price: $${Number(pythPrice.price) / Math.pow(10, -Number(pythPrice.expo))}`);
    console.log(`   Confidence: ±$${Number(pythPrice.conf) / Math.pow(10, -Number(pythPrice.expo))}`);
    
    // Check if we can update randomness
    console.log("🔄 Testing randomness update...");
    await slotMachine.updateRandomness();
    console.log("✅ Randomness update successful");
    
  } catch (error) {
    console.log("⚠️  Error testing functionality:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Slot machine deployment failed:", error);
    process.exit(1);
  });
