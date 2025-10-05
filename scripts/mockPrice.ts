import { ethers } from "hardhat";
import { PythSlotMachine } from "../typechain-types";

// Mock Pyth price feed for testing
interface MockPrice {
  price: bigint;
  conf: bigint;
  expo: number;
  publishTime: number;
}

async function main() {
  console.log("🧪 Mock Pyth price feed for testing...");

  // Read deployment info
  const deploymentInfo = JSON.parse(require('fs').readFileSync('./deployment.json', 'utf8'));
  
  const slotMachine = await ethers.getContractAt(
    "PythSlotMachine", 
    deploymentInfo.contractAddress
  ) as PythSlotMachine;

  console.log(`📍 Contract: ${deploymentInfo.contractAddress}`);

  // Get current Pyth price
  try {
    const price = await slotMachine.getPythPrice();
    console.log("\n📊 Current Pyth Price Feed Data:");
    console.log(`   Price: ${price.price}`);
    console.log(`   Confidence: ${price.conf}`);
    console.log(`   Exponent: ${price.expo}`);
    console.log(`   Publish Time: ${price.publishTime}`);
    console.log(`   Formatted Price: $${Number(price.price) / Math.pow(10, -Number(price.expo))}`);
  } catch (error: any) {
    console.log("⚠️  Could not fetch Pyth price (contract might not be deployed yet):", error.message);
  }

  // Simulate different price scenarios
  console.log("\n🎲 Simulating different price scenarios...");
  
  const scenarios = [
    { name: "High Volatility", price: 45000n * 10n**8n, conf: 1000n, expo: -8 },
    { name: "Low Volatility", price: 45000n * 10n**8n, conf: 50n, expo: -8 },
    { name: "Price Spike", price: 50000n * 10n**8n, conf: 2000n, expo: -8 },
    { name: "Price Drop", price: 40000n * 10n**8n, conf: 1500n, expo: -8 },
  ];

  scenarios.forEach((scenario, index) => {
    console.log(`\n📈 Scenario ${index + 1}: ${scenario.name}`);
    console.log(`   Price: $${Number(scenario.price) / Math.pow(10, -scenario.expo)}`);
    console.log(`   Confidence: ±$${Number(scenario.conf) / Math.pow(10, -scenario.expo)}`);
    console.log(`   Exponent: ${scenario.expo}`);
    
    // Simulate randomness generation with this price
    const mockRandomSeed = simulateRandomSeed(scenario);
    console.log(`   Generated Seed: ${mockRandomSeed}`);
    
    // Show what reels this would produce
    const reels = [
      Number((mockRandomSeed >> 0n) % 4n),
      Number((mockRandomSeed >> 8n) % 4n),
      Number((mockRandomSeed >> 16n) % 4n)
    ];
    console.log(`   Reels: [${reels.join(', ')}] (0=Bar, 1=Cherries, 2=Watermelon, 3=CoinbaseLogo)`);
    
    // Check for jackpot
    const jackpotCheck = Number((mockRandomSeed >> 24n) % 100000n);
    if (jackpotCheck === 0) {
      console.log(`   🎉 JACKPOT! (1 in 100,000 odds hit)`);
    } else {
      console.log(`   No jackpot (${jackpotCheck}/100000)`);
    }
  });

  console.log("\n✅ Mock price testing completed!");
}

function simulateRandomSeed(mockPrice: MockPrice): bigint {
  // Simulate the same randomness generation as the contract
  const blockTimestamp = BigInt(Math.floor(Date.now() / 1000));
  const txOrigin = BigInt("0x1234567890123456789012345678901234567890");
  const gasLeft = 1000000n;
  const nonce = 1n;
  const msgSender = BigInt("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");

  return BigInt(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["int64", "uint64", "int32", "uint", "uint", "uint256", "uint256", "uint256", "address"],
    [
      mockPrice.price,
      mockPrice.conf,
      mockPrice.expo,
      mockPrice.publishTime,
      blockTimestamp,
      txOrigin,
      gasLeft,
      nonce,
      ethers.getAddress(ethers.toBeHex(msgSender, 20))
    ]
  )));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Mock price testing failed:", error);
    process.exit(1);
  });
