import { ethers } from "hardhat";
import { MainSlotManager } from "../typechain-types";
import * as fs from "fs";

/**
 * @dev Script to fund the MainSlotManager jackpot pool
 */
async function main() {
  console.log("💰 Funding MainSlotManager jackpot...");

  // Read deployment info
  if (!fs.existsSync('./deployment.json')) {
    console.error("❌ deployment.json not found. Please deploy MainSlotManager first.");
    process.exit(1);
  }

  const deploymentInfo = JSON.parse(fs.readFileSync('./deployment.json', 'utf8'));
  
  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`👤 Using account: ${deployer.address}`);

  // Get the manager contract
  const manager = await ethers.getContractAt("MainSlotManager", deploymentInfo.managerAddress);

  // Get USDC contract
  const usdc = await ethers.getContractAt("IERC20", deploymentInfo.usdcAddress);

  // Check current balances
  const managerBalance = await usdc.balanceOf(deploymentInfo.managerAddress);
  const deployerBalance = await usdc.balanceOf(deployer.address);
  const currentJackpot = await manager.jackpotPool();
  
  console.log(`📊 Current balances:`);
  console.log(`   Manager USDC balance: ${ethers.formatUnits(managerBalance, 6)} USDC`);
  console.log(`   Deployer USDC balance: ${ethers.formatUnits(deployerBalance, 6)} USDC`);
  console.log(`   Current jackpot pool: ${ethers.formatUnits(currentJackpot, 6)} USDC`);

  // Fund amount (in USDC)
  const fundAmount = process.env.FUND_AMOUNT || '1000'; // Default 1000 USDC
  const fundAmountWei = ethers.parseUnits(fundAmount, 6);

  if (deployerBalance < fundAmountWei) {
    console.error(`❌ Insufficient USDC balance to fund jackpot`);
    console.log(`   Required: ${fundAmount} USDC`);
    console.log(`   Available: ${ethers.formatUnits(deployerBalance, 6)} USDC`);
    process.exit(1);
  }

  // Approve manager to spend USDC
  console.log(`\n🔐 Approving USDC...`);
  const approveTx = await usdc.approve(deploymentInfo.managerAddress, fundAmountWei);
  await approveTx.wait();
  console.log(`✅ USDC approved`);

  // Fund jackpot
  console.log(`\n💰 Funding jackpot with ${fundAmount} USDC...`);
  const fundTx = await manager.fundJackpot(fundAmountWei);
  await fundTx.wait();
  console.log(`✅ Jackpot funded`);

  // Check new jackpot balance
  const newJackpot = await manager.jackpotPool();
  console.log(`\n📊 Updated jackpot pool: ${ethers.formatUnits(newJackpot, 6)} USDC`);

  // Get updated manager stats
  const stats = await manager.getManagerStats();
  console.log(`\n📈 Manager statistics:`);
  console.log(`   Total volume: ${ethers.formatUnits(stats.totalVolume, 6)} USDC`);
  console.log(`   Total spins: ${stats.totalSpins}`);
  console.log(`   Total jackpot wins: ${stats.totalJackpotWins}`);
  console.log(`   Jackpot pool: ${ethers.formatUnits(stats.jackpotPool, 6)} USDC`);
  console.log(`   Slot machines: ${stats.slotMachineCount}`);

  console.log(`\n🎉 Jackpot funding completed successfully!`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Jackpot funding failed:", error);
    process.exit(1);
  });