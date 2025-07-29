import { run } from "hardhat";

async function main() {
  console.log("🔍 Starting contract verification on Sepolia...");
  
  // You'll need to update these addresses after deployment
  const MOCK_SAND_ADDRESS = process.env.SEPOLIA_SAND_TOKEN_ADDRESS || "";
  const GATEWAY_ADDRESS = process.env.SEPOLIA_GATEWAY_ADDRESS || "";
  
  if (!MOCK_SAND_ADDRESS || !GATEWAY_ADDRESS) {
    console.error("❌ Please set SEPOLIA_SAND_TOKEN_ADDRESS and SEPOLIA_GATEWAY_ADDRESS in .env");
    console.log("Run the test-sepolia script first to get the addresses");
    return;
  }

  console.log("Verifying contracts:");
  console.log("- Mock SAND:", MOCK_SAND_ADDRESS);
  console.log("- Gateway:", GATEWAY_ADDRESS);

  try {
    console.log("\n🔍 Verifying Mock SAND Token...");
    await run("verify:verify", {
      address: MOCK_SAND_ADDRESS,
      constructorArguments: [
        "Mock SAND",
        "mSAND", 
        "1000000000000000000000000" // 1M tokens in wei
      ],
    });
    console.log("✅ Mock SAND Token verified!");
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ Mock SAND Token already verified!");
    } else {
      console.error("❌ Mock SAND verification failed:", error.message);
    }
  }

  try {
    console.log("\n🔍 Verifying SandPaymentGateway...");
    await run("verify:verify", {
      address: GATEWAY_ADDRESS,
      constructorArguments: [
        MOCK_SAND_ADDRESS,
        100, // 1% fee
        process.env.FEE_RECIPIENT || ""
      ],
    });
    console.log("✅ SandPaymentGateway verified!");
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ SandPaymentGateway already verified!");
    } else {
      console.error("❌ Gateway verification failed:", error.message);
    }
  }

  console.log("\n🎉 Verification process completed!");
  console.log("\n🌐 View verified contracts on Etherscan:");
  console.log(`   - Mock SAND: https://sepolia.etherscan.io/address/${MOCK_SAND_ADDRESS}#code`);
  console.log(`   - Gateway: https://sepolia.etherscan.io/address/${GATEWAY_ADDRESS}#code`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
