import { ethers } from "hardhat";

async function main() {
  console.log("🔍 Debugging signers and network connection");
  console.log("=".repeat(50));

  try {
    // Check network
    const network = await ethers.provider.getNetwork();
    console.log("✅ Connected to network:", network.name, "Chain ID:", network.chainId);

    // Check signers
    const signers = await ethers.getSigners();
    console.log("📝 Number of signers available:", signers.length);
    
    if (signers.length === 0) {
      console.log("❌ No signers available! Check your PRIVATE_KEY in .env");
      return;
    }

    // Test first signer
    const deployer = signers[0];
    console.log("✅ Deployer address:", deployer.address);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("💰 Deployer balance:", ethers.formatEther(balance), "ETH");
    
    if (balance === 0n) {
      console.log("⚠️  Warning: Deployer has 0 ETH balance. You need Base Sepolia ETH to deploy contracts.");
      console.log("🚰 Get free ETH from: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet");
    }

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
