import { ethers } from "hardhat";

async function main() {
  console.log("🔐 Generating new test wallet for Base Sepolia");
  console.log("=".repeat(50));

  // Generate a new random wallet
  const wallet = ethers.Wallet.createRandom();
  
  console.log("✅ New wallet generated!");
  console.log("📝 Address:", wallet.address);
  console.log("🔑 Private Key:", wallet.privateKey);
  console.log("🎯 Mnemonic:", wallet.mnemonic?.phrase);
  
  console.log("\n📋 Next steps:");
  console.log("1. Copy the private key (without 0x prefix) to your .env file:");
  console.log(`   PRIVATE_KEY=${wallet.privateKey.slice(2)}`);
  console.log("\n2. Get free Base Sepolia ETH for this address:");
  console.log("   🚰 Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet");
  console.log(`   📍 Address to fund: ${wallet.address}`);
  console.log("\n3. Wait for the faucet transaction to confirm (1-2 minutes)");
  console.log("\n4. Run the test script:");
  console.log("   npx hardhat run scripts/test-base-sepolia.ts --network baseSepolia");
  
  console.log("\n⚠️  SECURITY WARNING:");
  console.log("   - This is a TEST wallet only!");
  console.log("   - Never use this private key for mainnet or real funds!");
  console.log("   - Keep your private keys secure and never share them!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
