import hre from "hardhat";
import { ethers } from "ethers";
// Utiliser hre.ethers partout pour compatibilité Hardhat


async function main() {
  console.log("🚀 Testing SandPaymentGateway on Base Sepolia");
  console.log("=".repeat(50));

  const signers = await hre.ethers.getSigners();
  const deployer = signers[0];
  const user = signers[1] || signers[0]; // Use deployer as user if only one signer
  const recipient = signers[2] || signers[0]; // Use deployer as recipient if needed

  console.log("Deployer address:", await deployer.getAddress());
  console.log("User address:", await user.getAddress());
  console.log("Recipient:", await recipient.getAddress());

  // Check balances
  const deployerBalance = await deployer.provider.getBalance(await deployer.getAddress());
  const userBalance = await deployer.provider.getBalance(await user.getAddress());

  console.log("Deployer balance:", hre.ethers.formatEther(deployerBalance), "ETH");
  console.log("User balance:", hre.ethers.formatEther(userBalance), "ETH");

  if (deployerBalance < hre.ethers.parseEther("0.01")) {
    console.error("❌ Insufficient balance for deployment. Need at least 0.01 ETH");
    return;
  }

  console.log("\n📦 Step 1: Deploying Mock SAND Token");
  console.log("-".repeat(40));

  // Deploy Mock SAND Token
  const MockERC20Permit = await hre.ethers.getContractFactory("MockERC20Permit");
  const initialSupply = hre.ethers.parseEther("1000000"); // 1M tokens
  const mockSand = await MockERC20Permit.deploy("Mock SAND", "mSAND", initialSupply) as any;
  await mockSand.waitForDeployment();

  const mockSandAddress = await mockSand.getAddress();
  console.log("✅ Mock SAND deployed at:", mockSandAddress);

  // Transfer some tokens to user for testing
  const userTokens = hre.ethers.parseEther("10000"); // 10k tokens
  await mockSand.transfer(await user.getAddress(), userTokens);
  console.log("✅ Transferred", hre.ethers.formatEther(userTokens), "mSAND to user");

  console.log("\n🏗️  Step 2: Deploying SandPaymentGateway");
  console.log("-".repeat(40));

  // Deploy SandPaymentGateway
  const SandPaymentGateway = await hre.ethers.getContractFactory("SandPaymentGateway");
  const sandPaymentGateway = await SandPaymentGateway.deploy(
    mockSandAddress
  ) as any;
  await sandPaymentGateway.waitForDeployment();

  const gatewayAddress = await sandPaymentGateway.getAddress();
  console.log("✅ SandPaymentGateway deployed at:", gatewayAddress);

  console.log("\n🧪 Step 3: Testing Payment with Approval");
  console.log("-".repeat(40));

  const orderId1 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("test-order-1"));
  const paymentAmount = hre.ethers.parseEther("100"); // 100 tokens

  // Approve tokens
  // Print all signer addresses and balances
  console.log("--- Signer Diagnostics ---");
  for (let i = 0; i < signers.length; i++) {
    const addr = await signers[i].getAddress();
    const ethBal = await signers[i].provider.getBalance(addr);
    const sandBal = await mockSand.balanceOf(addr);
    console.log(`Signer[${i}] address: ${addr}`);
    console.log(`  ETH: ${hre.ethers.formatEther(ethBal)}, mSAND: ${hre.ethers.formatEther(sandBal)}`);
  }
  // Approve tokens
  const approveTx = await mockSand.connect(user).approve(gatewayAddress, paymentAmount);
  const approveReceipt = await approveTx.wait();
  console.log("--- Approve Transaction Receipt ---");
  console.log(approveReceipt);
  if (approveReceipt.status !== 1) {
    throw new Error("Approve transaction failed!");
  }
  console.log("✅ User approved", hre.ethers.formatEther(paymentAmount), "mSAND");

  // Diagnostics before payment
  const userSandBalance = await mockSand.balanceOf(await user.getAddress());
  const contractSandBalance = await mockSand.balanceOf(gatewayAddress);
  const userAllowance = await mockSand.allowance(await user.getAddress(), gatewayAddress);
  console.log("--- Diagnostics before pay() ---");
  console.log("User mSAND balance:", hre.ethers.formatEther(userSandBalance));
  console.log("User allowance to gateway:", hre.ethers.formatEther(userAllowance));
  console.log("Contract (gateway) mSAND balance:", hre.ethers.formatEther(contractSandBalance));
  console.log("OrderId1:", orderId1);
  console.log("FeeRecipient:", recipient.address);
  // Make payment
  let receipt1;
  try {
    const tx1 = await sandPaymentGateway.connect(user).pay(orderId1, paymentAmount, recipient.address);
    receipt1 = await tx1.wait();
    console.log("✅ Payment processed, tx hash:", receipt1?.hash);
  } catch (err: any) {
    if (err && err.error && err.error.message) {
      console.error('❌ Payment reverted with reason:', err.error.message);
    } else if (err && err.message) {
      console.error('❌ Payment reverted with error:', err.message);
    } else {
      console.error('❌ Payment reverted with unknown error:', err);
    }
    throw err;
  }

  if (receipt1) {
    // Cherche et parse l'event PaymentDone
    const eventLog = receipt1.logs.find((log: { topics: string[]; data: any; }) => {
      try {
        const parsed = sandPaymentGateway.interface.parseLog({
          topics: log.topics as string[],
          data: log.data
        });
        return parsed?.name === "PaymentDone";
      } catch {
        return false;
      }
    });
    if (eventLog) {
      const parsed = sandPaymentGateway.interface.parseLog({
        topics: eventLog.topics as string[],
        data: eventLog.data
      });
      console.log("✅ PaymentDone event emitted:");
      console.log("   - Order ID:", parsed?.args[0]);
      console.log("   - Payer:", parsed?.args[1]);
      console.log("   - Amount:", hre.ethers.formatEther(parsed?.args[2]), "mSAND");
    } else {
      console.error("❌ PaymentDone event not found!");
    }
  }

  console.log("\n🔐 Step 4: Testing Payment with Permit (EIP-2612)");
  console.log("-".repeat(40));

  const orderId2 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("test-order-2"));
  const permitAmount = hre.ethers.parseEther("30"); // 30 tokens (reduced amount)
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

  // Check user balance before permit
  const userBalanceBefore = await mockSand.balanceOf(user.address);
  console.log("User balance before permit:", hre.ethers.formatEther(userBalanceBefore), "mSAND");

  // Get permit signature
  const domain = {
    name: await mockSand.name(),
    version: "1",
    chainId: await user.provider.getNetwork().then((n: { chainId: bigint }) => Number(n.chainId)),
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
    owner: await user.getAddress(),
    spender: gatewayAddress,
    value: permitAmount,
    nonce: await mockSand.nonces(await user.getAddress()),
    deadline: deadline,
  };

  const signature = await user.signTypedData(domain, types, values);
  const { v, r, s } = hre.ethers.Signature.from(signature);

  console.log("✅ EIP-2612 permit signature created");

  // Execute payWithPermit
  const tx2 = await sandPaymentGateway.connect(user).payWithPermit(
    orderId2,
    permitAmount,
    deadline,
    v,
    r,
    s,
    recipient.address
  );
  const receipt2 = await tx2.wait();
  console.log("✅ Permit payment processed, tx hash:", receipt2?.hash);

  console.log("\n📊 Step 5: Checking Final Balances");
  console.log("-".repeat(40));

  const deployerTokenBalance = await mockSand.balanceOf(await deployer.getAddress());
  const userTokenBalance = await mockSand.balanceOf(await user.getAddress());
  const recipientBalance = await mockSand.balanceOf(await recipient.getAddress());
  const contractBalance = await sandPaymentGateway.getBalance();

  console.log("Deployer mSAND balance:", hre.ethers.formatEther(deployerTokenBalance));
  console.log("User mSAND balance:", hre.ethers.formatEther(userTokenBalance));
  console.log("Fee recipient balance:", hre.ethers.formatEther(recipientBalance));
  console.log("Contract balance:", hre.ethers.formatEther(contractBalance));

  // Calculate expected values
  const totalPaid = paymentAmount + permitAmount; // 150 tokens
  const expectedFee = totalPaid * BigInt(0) / BigInt(10000); // 1.5 tokens
  const expectedNet = totalPaid - expectedFee; // 148.5 tokens

  console.log("\n📈 Expected vs Actual:");
  console.log("Expected total fee:", hre.ethers.formatEther(expectedFee), "mSAND");
  console.log("Actual fee recipient balance:", hre.ethers.formatEther(recipientBalance), "mSAND");
  console.log("Expected net to deployer:", hre.ethers.formatEther(expectedNet), "mSAND");

  console.log("\n🔄 Step 5: Testing Admin Functions");
  console.log("-".repeat(40));

  // No admin fee update logic in new contract
  console.log("✅ Admin functions test skipped (no fee logic in contract)");

  console.log("\n📊 Step 6: Final Balance Check");
  console.log("-".repeat(40));

  const finalDeployerTokenBalance = await mockSand.balanceOf(await deployer.getAddress());
  const finalUserTokenBalance = await mockSand.balanceOf(await user.getAddress());
  const finalFeeRecipientBalance = await mockSand.balanceOf(await recipient.getAddress());
  const finalContractBalance = await sandPaymentGateway.getBalance();

  console.log("Deployer mSAND balance:", hre.ethers.formatEther(finalDeployerTokenBalance));
  console.log("User mSAND balance:", hre.ethers.formatEther(finalUserTokenBalance));
  console.log("Fee recipient balance:", hre.ethers.formatEther(finalFeeRecipientBalance));
  console.log("Contract balance:", hre.ethers.formatEther(finalContractBalance));

  console.log("\n✅ All tests completed successfully on Base Sepolia!");
  console.log("\n📝 Contract addresses for verification:");
  console.log("   - Mock SAND Token:", mockSandAddress);
  console.log("   - SandPaymentGateway:", gatewayAddress);

  console.log("\n🔍 VERIFICATION COMMANDS:");
  console.log("-".repeat(50));
  console.log("1. Verify Mock SAND Token:");
  console.log(`npx hardhat verify --network baseSepolia ${mockSandAddress} "Mock SAND" "mSAND" "${initialSupply.toString()}"`);

  console.log("\n2. Verify SandPaymentGateway:");
  console.log(`npx hardhat verify --network baseSepolia ${gatewayAddress} "${mockSandAddress}" ${0} "${recipient.address}"`);

  console.log("\n🌐 View on Basescan:");
  console.log(`   - Mock SAND: https://sepolia.basescan.org/address/${mockSandAddress}`);
  console.log(`   - Gateway: https://sepolia.basescan.org/address/${gatewayAddress}`);

  // Save to .env for easy access
  console.log("\n💾 Add to .env:");
  console.log(`BASE_SEPOLIA_SAND_TOKEN_ADDRESS=${mockSandAddress}`);
  console.log(`BASE_SEPOLIA_GATEWAY_ADDRESS=${gatewayAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  });
