import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Testing SandPaymentGateway on Sepolia");
  console.log("=" .repeat(50));

  const [deployer, user, feeRecipient] = await ethers.getSigners();
  
  console.log("Deployer address:", deployer.address);
  console.log("User address:", user.address);
  console.log("Fee recipient:", feeRecipient.address);
  
  // Check balances
  const deployerBalance = await deployer.provider.getBalance(deployer.address);
  const userBalance = await deployer.provider.getBalance(user.address);
  
  console.log("Deployer balance:", ethers.formatEther(deployerBalance), "ETH");
  console.log("User balance:", ethers.formatEther(userBalance), "ETH");
  
  if (deployerBalance < ethers.parseEther("0.02")) {
    console.error("❌ Insufficient balance for deployment. Need at least 0.02 ETH");
    console.log("💡 Get Sepolia ETH from: https://sepoliafaucet.com/");
    return;
  }

  console.log("\n📦 Step 1: Deploying Mock SAND Token");
  console.log("-".repeat(40));
  
  // Deploy Mock SAND Token
  const MockERC20Permit = await ethers.getContractFactory("MockERC20Permit");
  const initialSupply = ethers.parseEther("1000000"); // 1M tokens
  const mockSand = await MockERC20Permit.deploy("Mock SAND", "mSAND", initialSupply);
  await mockSand.waitForDeployment();
  
  const mockSandAddress = await mockSand.getAddress();
  console.log("✅ Mock SAND deployed at:", mockSandAddress);
  
  // Transfer some tokens to user for testing
  const userTokens = ethers.parseEther("10000"); // 10k tokens
  await mockSand.transfer(user.address, userTokens);
  console.log("✅ Transferred", ethers.formatEther(userTokens), "mSAND to user");

  console.log("\n🏗️  Step 2: Deploying SandPaymentGateway");
  console.log("-".repeat(40));
  
  // Deploy SandPaymentGateway
  const SandPaymentGateway = await ethers.getContractFactory("SandPaymentGateway");
  const feeBasisPoints = 100; // 1%
  const sandPaymentGateway = await SandPaymentGateway.deploy(
    mockSandAddress,
    feeBasisPoints,
    feeRecipient.address
  );
  await sandPaymentGateway.waitForDeployment();
  
  const gatewayAddress = await sandPaymentGateway.getAddress();
  console.log("✅ SandPaymentGateway deployed at:", gatewayAddress);

  console.log("\n🧪 Step 3: Testing Payment with Approval");
  console.log("-".repeat(40));
  
  const orderId1 = ethers.keccak256(ethers.toUtf8Bytes("sepolia-test-order-1"));
  const paymentAmount = ethers.parseEther("100"); // 100 tokens
  
  // Approve tokens
  await mockSand.connect(user).approve(gatewayAddress, paymentAmount);
  console.log("✅ User approved", ethers.formatEther(paymentAmount), "mSAND");
  
  // Make payment
  const tx1 = await sandPaymentGateway.connect(user).pay(orderId1, paymentAmount);
  const receipt1 = await tx1.wait();
  console.log("✅ Payment processed, tx hash:", receipt1?.hash);
  
  // Check if order is processed
  const isProcessed1 = await sandPaymentGateway.isProcessed(orderId1);
  console.log("✅ Order processed status:", isProcessed1);

  console.log("\n🔐 Step 4: Testing Payment with Permit (EIP-2612)");
  console.log("-".repeat(40));
  
  const orderId2 = ethers.keccak256(ethers.toUtf8Bytes("sepolia-test-order-2"));
  const permitAmount = ethers.parseEther("50"); // 50 tokens
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  
  // Get permit signature
  const domain = {
    name: await mockSand.name(),
    version: "1",
    chainId: await user.provider.getNetwork().then(n => n.chainId),
    verifyingContract: mockSandAddress,
  };

  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const values = {
    owner: user.address,
    spender: gatewayAddress,
    value: permitAmount,
    nonce: await mockSand.nonces(user.address),
    deadline: deadline,
  };

  const signature = await user.signTypedData(domain, types, values);
  const { v, r, s } = ethers.Signature.from(signature);
  
  console.log("✅ EIP-2612 permit signature created");
  
  // Execute payWithPermit
  const tx2 = await sandPaymentGateway.connect(user).payWithPermit(
    orderId2, 
    permitAmount, 
    deadline, 
    v, 
    r, 
    s
  );
  const receipt2 = await tx2.wait();
  console.log("✅ Permit payment processed, tx hash:", receipt2?.hash);

  console.log("\n🔄 Step 5: Testing Admin Functions");
  console.log("-".repeat(40));
  
  // Test fee update
  const newFee = 150; // 1.5%
  await sandPaymentGateway.connect(deployer).updateFee(newFee);
  const updatedFee = await sandPaymentGateway.feeBasisPoints();
  console.log("✅ Fee updated to:", updatedFee.toString(), "basis points");
  
  // Test refund
  const refundOrderId = orderId1;
  const refundAmount = ethers.parseEther("10");
  await sandPaymentGateway.connect(deployer).refund(refundOrderId, user.address, refundAmount);
  console.log("✅ Refund of", ethers.formatEther(refundAmount), "mSAND processed");

  console.log("\n📊 Step 6: Final Balance Check");
  console.log("-".repeat(40));
  
  const deployerTokenBalance = await mockSand.balanceOf(deployer.address);
  const userTokenBalance = await mockSand.balanceOf(user.address);
  const feeRecipientBalance = await mockSand.balanceOf(feeRecipient.address);
  const contractBalance = await sandPaymentGateway.getBalance();
  
  console.log("Deployer mSAND balance:", ethers.formatEther(deployerTokenBalance));
  console.log("User mSAND balance:", ethers.formatEther(userTokenBalance));
  console.log("Fee recipient balance:", ethers.formatEther(feeRecipientBalance));
  console.log("Contract balance:", ethers.formatEther(contractBalance));

  console.log("\n✅ All tests completed successfully on Sepolia!");
  console.log("\n📝 Contract addresses for verification:");
  console.log("   - Mock SAND Token:", mockSandAddress);
  console.log("   - SandPaymentGateway:", gatewayAddress);
  
  console.log("\n🔍 VERIFICATION COMMANDS:");
  console.log("-".repeat(50));
  console.log("1. Verify Mock SAND Token:");
  console.log(`npx hardhat verify --network sepolia ${mockSandAddress} "Mock SAND" "mSAND" "${initialSupply.toString()}"`);
  
  console.log("\n2. Verify SandPaymentGateway:");
  console.log(`npx hardhat verify --network sepolia ${gatewayAddress} "${mockSandAddress}" ${feeBasisPoints} "${feeRecipient.address}"`);
  
  console.log("\n🌐 View on Etherscan:");
  console.log(`   - Mock SAND: https://sepolia.etherscan.io/address/${mockSandAddress}`);
  console.log(`   - Gateway: https://sepolia.etherscan.io/address/${gatewayAddress}`);
  
  // Save to .env for easy access
  console.log("\n💾 Add to .env:");
  console.log(`SEPOLIA_SAND_TOKEN_ADDRESS=${mockSandAddress}`);
  console.log(`SEPOLIA_GATEWAY_ADDRESS=${gatewayAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  });
