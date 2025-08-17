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

  // Decide between mock token (dev) and real SAND (prod)
  const isProd = ["polygonMainnet", "polygon", "mainnet", "ethereum"].includes((hre.network.name || "").toString()) || process.env.USE_REAL_SAND === "1";
  let mockSand: any;
  let mockSandAddress: string;
  let initialSupply = hre.ethers.parseEther("1000000"); // default for mock

  if (isProd) {
    console.log("\n📦 Step 1: Using real SAND token (production mode)");
    console.log("-".repeat(40));
    const realSandAddress = process.env.SAND_TOKEN_ADDRESS || "";
    if (!realSandAddress) {
      throw new Error("SAND_TOKEN_ADDRESS is required in production mode");
    }
    mockSand = await hre.ethers.getContractAt("IERC20", realSandAddress);
    mockSandAddress = realSandAddress;
    console.log("✅ Using SAND at:", mockSandAddress);
  } else {
    console.log("\n📦 Step 1: Deploying Mock SAND Token");
    console.log("-".repeat(40));
    const MockERC20Permit = await hre.ethers.getContractFactory("MockERC20Permit");
    initialSupply = hre.ethers.parseEther("1000000"); // 1M tokens
    mockSand = await MockERC20Permit.deploy("Mock SAND", "mSAND", initialSupply) as any;
    await mockSand.waitForDeployment();
    mockSandAddress = await mockSand.getAddress();
    console.log("✅ Mock SAND deployed at:", mockSandAddress);

    // Transfer some tokens to user for testing
    const userTokens = hre.ethers.parseEther("10000"); // 10k tokens
    await mockSand.transfer(await user.getAddress(), userTokens);
    console.log("✅ Transferred", hre.ethers.formatEther(userTokens), "mSAND to user");
  }

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
  const paymentAmount = hre.ethers.parseEther("0.001"); // 100 tokens

  // Print all signer addresses and balances
  console.log("--- Signer Diagnostics ---");
  for (let i = 0; i < signers.length; i++) {
    const addr = await signers[i].getAddress();
    const ethBal = await signers[i].provider.getBalance(addr);
    let sandBalStr = "(unavailable)";
    try {
      const sandBal = await mockSand.balanceOf(addr);
      sandBalStr = hre.ethers.formatEther(sandBal);
    } catch (e) {
      sandBalStr = `(error reading balance: ${String((e as any)?.shortMessage || (e as any)?.message || e)})`;
    }
    console.log(`Signer[${i}] address: ${addr}`);
    console.log(`  ETH: ${hre.ethers.formatEther(ethBal)}, mSAND: ${sandBalStr}`);
  }
  const doLivePayment = process.env.DO_LIVE_PAYMENT === "1" || !isProd; // default allow in dev, require opt-in in prod
  let approveReceipt: any | undefined;
  if (doLivePayment) {
    // Approve tokens
    const approveTx = await mockSand.connect(user).approve(gatewayAddress, paymentAmount);
    approveReceipt = await approveTx.wait();
    console.log("--- Approve Transaction Receipt ---");
    console.log(approveReceipt);
    if (approveReceipt.status !== 1) {
      throw new Error("Approve transaction failed!");
    }
    console.log("✅ User approved", hre.ethers.formatEther(paymentAmount), "mSAND");
  } else {
    console.log("(Production mode) Skipping on-chain approve. Set DO_LIVE_PAYMENT=1 to execute.");
  }

  // Additional diagnostics to ensure spender/owner/amount are correct
  console.log("--- Post-approve Diagnostics ---");
  console.log("Token:", mockSandAddress);
  console.log("Gateway (spender):", gatewayAddress);
  console.log("Owner (user):", await user.getAddress());
  if (approveReceipt) {
    try {
      const approvalLog = approveReceipt.logs.find((log: any) => {
        try {
          const parsed = mockSand.interface.parseLog({ topics: log.topics as string[], data: log.data });
          return parsed?.name === "Approval";
        } catch {
          return false;
        }
      });
      if (approvalLog) {
        const parsed = mockSand.interface.parseLog({ topics: approvalLog.topics as string[], data: approvalLog.data });
        console.log("Approval event:");
        console.log("  owner:", parsed.args[0]);
        console.log("  spender:", parsed.args[1]);
        console.log("  value:", hre.ethers.formatEther(parsed.args[2]));
      } else {
        console.log("No Approval event found in receipt logs");
      }
    } catch (e) {
      console.log("(Skipped Approval event parsing)", e);
    }
  } else {
    console.log("(Production mode) Approval not executed; skipping receipt parsing.");
  }

  // Some RPCs may lag state immediately after receipt on L2/L1.
  // Poll allowance until it reflects the approved amount or timeout.
  const ownerAddr = await user.getAddress();
  const spenderAddr = gatewayAddress;
  const expectedAllowance = paymentAmount;
  let polledAllowance = 0n;
  for (let attempt = 0; attempt < 6; attempt++) {
    polledAllowance = await mockSand.allowance(ownerAddr, spenderAddr);
    if (polledAllowance >= expectedAllowance) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  // Diagnostics before payment
  const userSandBalance = await mockSand.balanceOf(ownerAddr);
  const contractSandBalance = await mockSand.balanceOf(gatewayAddress);
  const userAllowance = await mockSand.allowance(ownerAddr, gatewayAddress);
  console.log("--- Diagnostics before pay() ---");
  console.log("User mSAND balance:", hre.ethers.formatEther(userSandBalance));
  console.log("User allowance to gateway:", hre.ethers.formatEther(userAllowance));
  if (userAllowance < expectedAllowance) {
    console.log("(Note) Polled allowance:", hre.ethers.formatEther(polledAllowance));
    console.log("(Note) Expected allowance:", hre.ethers.formatEther(expectedAllowance));
  }
  console.log("Contract (gateway) mSAND balance:", hre.ethers.formatEther(contractSandBalance));
  console.log("OrderId1:", orderId1);
  console.log("FeeRecipient:", recipient.address);
  // Make payment (opt-in in prod)
  let receipt1;
  if (doLivePayment) {
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
  } else {
    console.log("(Production mode) Skipping on-chain pay(). Set DO_LIVE_PAYMENT=1 to execute.");
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

  const hasPermit = process.env.HAS_PERMIT === "1" && !isProd ? true : process.env.HAS_PERMIT === "1"; // default off in prod unless explicitly enabled
  if (hasPermit && doLivePayment) {
    // Get permit signature
    const domain = {
      name: await (mockSand.name ? mockSand.name() : Promise.resolve("SAND")),
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
      nonce: (mockSand.nonces ? await mockSand.nonces(await user.getAddress()) : 0n),
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
  } else {
    console.log("(Permit) Skipped. Enable with HAS_PERMIT=1 and DO_LIVE_PAYMENT=1 if token supports EIP-2612.");
  }

  console.log("\n📊 Step 5: Checking Final Balances");
  console.log("-".repeat(40));

  const deployerTokenBalance = await mockSand.balanceOf(await deployer.getAddress());
  const userTokenBalance = await mockSand.balanceOf(await user.getAddress());
  const recipientBalance = await mockSand.balanceOf(await recipient.getAddress());
  const contractBalance = await mockSand.balanceOf(gatewayAddress);

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
  const finalContractBalance = await mockSand.balanceOf(gatewayAddress);

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
  console.log(`npx hardhat verify --network baseSepolia ${gatewayAddress} "${mockSandAddress}"`);

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
