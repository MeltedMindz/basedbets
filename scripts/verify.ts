import { run } from "hardhat";
import * as fs from "fs";

async function main() {
  console.log("🔍 Starting contract verification...");

  // Read deployment info
  if (!fs.existsSync('./deployment.json')) {
    console.error("❌ deployment.json not found. Please deploy first.");
    process.exit(1);
  }

  const deploymentInfo = JSON.parse(fs.readFileSync('./deployment.json', 'utf8'));
  
  console.log(`📡 Network: ${deploymentInfo.network}`);
  console.log(`📍 Contract: ${deploymentInfo.contractAddress}`);
  console.log(`🔧 Constructor args: ${deploymentInfo.constructorArgs.join(', ')}`);

  try {
    await run("verify:verify", {
      address: deploymentInfo.contractAddress,
      constructorArguments: deploymentInfo.constructorArgs,
    });

    console.log("✅ Contract verified successfully!");
    console.log(`🔗 View on BaseScan: ${deploymentInfo.explorer}`);
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("ℹ️  Contract is already verified");
    } else {
      console.error("❌ Verification failed:", error.message);
      process.exit(1);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Verification failed:", error);
    process.exit(1);
  });
