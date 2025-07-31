import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Configuration
  const SAND_TOKEN_ADDRESS = process.env.SAND_TOKEN_ADDRESS || "0x3845badAde8e6dFF049820680d1F14bD3903a5d0"; // Mainnet SAND
  console.log("Deployment configuration:");
  console.log("- SAND Token Address:", SAND_TOKEN_ADDRESS);

  // Deploy SandPaymentGateway
  const SandPaymentGateway = await ethers.getContractFactory("SandPaymentGateway");
  const sandPaymentGateway = await SandPaymentGateway.deploy(
    SAND_TOKEN_ADDRESS
  ) as any;

  await sandPaymentGateway.waitForDeployment();
  const gatewayAddress = await sandPaymentGateway.getAddress();

  console.log("SandPaymentGateway deployed to:", gatewayAddress);

  // Verify deployment
  console.log("\nVerifying deployment...");
  const sandAddress = await sandPaymentGateway.sand();
  const owner = await sandPaymentGateway.owner();

  console.log("Verification results:");
  console.log("- SAND Token:", sandAddress);
  console.log("- Owner:", owner);

  // Save deployment info
  const deploymentInfo = {
    network: await ethers.provider.getNetwork(),
    contractAddress: gatewayAddress,
    sandTokenAddress: sandAddress,
    owner: owner,
    deployer: deployer.address,
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: new Date().toISOString()
  };

  console.log("\nDeployment completed successfully!");
  console.log("Deployment info:", JSON.stringify(deploymentInfo, null, 2));

  // Instructions for verification on Etherscan (if on mainnet/testnet)
  if (Number(deploymentInfo.network.chainId) !== 31337) { // Not local hardhat network
    console.log("\nTo verify on Etherscan, run:");
    console.log(`npx hardhat verify --network ${process.env.HARDHAT_NETWORK || 'mainnet'} ${gatewayAddress} "${SAND_TOKEN_ADDRESS}"`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
