import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SandPaymentGateway, MockERC20Permit } from "../typechain-types";

describe("SandPaymentGateway", function () {
  let sandPaymentGateway: SandPaymentGateway;
  let mockSand: MockERC20Permit;
  let owner: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let user: SignerWithAddress;
  let other: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.utils.parseEther("1000000");
  const FEE_BASIS_POINTS = 100; // 1%
  const MAX_FEE_BASIS_POINTS = 1000; // 10%

  beforeEach(async function () {
    [owner, feeRecipient, user, other] = await ethers.getSigners();

    // Deploy mock $SAND token with permit functionality
    const MockERC20Permit = await ethers.getContractFactory("MockERC20Permit");
    mockSand = await MockERC20Permit.deploy("The Sandbox", "SAND", INITIAL_SUPPLY);
    await mockSand.deployed();

    // Deploy SandPaymentGateway
    const SandPaymentGateway = await ethers.getContractFactory("SandPaymentGateway");
    sandPaymentGateway = await SandPaymentGateway.deploy(
      mockSand.address,
      FEE_BASIS_POINTS,
      feeRecipient.address
    );
    await sandPaymentGateway.deployed();

    // Transfer some tokens to user for testing
    await mockSand.transfer(user.address, ethers.utils.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set the correct sand token address", async function () {
      expect(await sandPaymentGateway.sand()).to.equal(mockSand.address);
    });

    it("Should set the correct fee basis points", async function () {
      expect(await sandPaymentGateway.feeBasisPoints()).to.equal(FEE_BASIS_POINTS);
    });

    it("Should set the correct fee recipient", async function () {
      expect(await sandPaymentGateway.feeRecipient()).to.equal(feeRecipient.address);
    });

    it("Should set the correct owner", async function () {
      expect(await sandPaymentGateway.owner()).to.equal(owner.address);
    });

    it("Should revert with zero address for sand token", async function () {
      const SandPaymentGateway = await ethers.getContractFactory("SandPaymentGateway");
      await expect(
        SandPaymentGateway.deploy(ethers.constants.AddressZero, FEE_BASIS_POINTS, feeRecipient.address)
      ).to.be.revertedWithCustomError(sandPaymentGateway, "ZeroAddress");
    });

    it("Should revert with fee basis points > 1000", async function () {
      const SandPaymentGateway = await ethers.getContractFactory("SandPaymentGateway");
      await expect(
        SandPaymentGateway.deploy(mockSand.address, 1001, feeRecipient.address)
      ).to.be.revertedWithCustomError(sandPaymentGateway, "InvalidFee");
    });
  });

  describe("payWithPermit", function () {
    const orderId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("order-123"));
    const amount = ethers.utils.parseEther("100");

    it("Should process payment with permit successfully", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      // Get permit signature
      const domain = {
        name: await mockSand.name(),
        version: "1",
        chainId: await mockSand.getChainId(),
        verifyingContract: mockSand.address,
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
        spender: sandPaymentGateway.address,
        value: amount,
        nonce: await mockSand.nonces(user.address),
        deadline: deadline,
      };

      const signature = await user._signTypedData(domain, types, values);
      const { v, r, s } = ethers.utils.splitSignature(signature);

      // Calculate expected fee and net amounts
      const expectedFee = amount.mul(FEE_BASIS_POINTS).div(10000);
      const expectedNet = amount.sub(expectedFee);

      // Get initial balances
      const initialOwnerBalance = await mockSand.balanceOf(owner.address);
      const initialFeeRecipientBalance = await mockSand.balanceOf(feeRecipient.address);

      // Execute payWithPermit
      await expect(
        sandPaymentGateway.connect(user).payWithPermit(orderId, amount, deadline, v, r, s, feeRecipient.address)
      )
        .to.emit(sandPaymentGateway, "PaymentDone")
        .withArgs(orderId, user.address, amount);

      // Check balances
      expect(await mockSand.balanceOf(owner.address)).to.equal(initialOwnerBalance.add(expectedNet));
      expect(await mockSand.balanceOf(feeRecipient.address)).to.equal(initialFeeRecipientBalance.add(expectedFee));

      // Check order is marked as processed
      expect(await sandPaymentGateway.processed(orderId)).to.be.true;
    });

    it("Should revert on double processing", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      
      // First payment
      const domain = {
        name: await mockSand.name(),
        version: "1",
        chainId: await mockSand.getChainId(),
        verifyingContract: mockSand.address,
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
        spender: sandPaymentGateway.address,
        value: amount,
        nonce: await mockSand.nonces(user.address),
        deadline: deadline,
      };

      const signature = await user._signTypedData(domain, types, values);
      const { v, r, s } = ethers.utils.splitSignature(signature);

      await sandPaymentGateway
        .connect(user)
        .payWithPermit(orderId, amount, deadline, v, r, s, feeRecipient.address);

      // Second payment should revert
      const values2 = {
        ...values,
        nonce: await mockSand.nonces(user.address),
      };

      const signature2 = await user._signTypedData(domain, types, values2);
      const { v: v2, r: r2, s: s2 } = ethers.utils.splitSignature(signature2);

      await expect(
        sandPaymentGateway
          .connect(user)
          .payWithPermit(orderId, amount, deadline, v2, r2, s2, feeRecipient.address)
      ).to.be.revertedWithCustomError(sandPaymentGateway, "AlreadyProcessed");
    });

    it("Should revert with zero amount", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await expect(
        sandPaymentGateway.connect(user).payWithPermit(
          orderId,
          0,
          deadline,
          0,
          ethers.constants.HashZero,
          ethers.constants.HashZero,
          feeRecipient.address
        )
      ).to.be.revertedWithCustomError(sandPaymentGateway, "ZeroAmount");
    });
  });

  describe("pay", function () {
    const orderId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("order-456"));
    const amount = ethers.utils.parseEther("50");

    it("Should process payment with approval successfully", async function () {
      // Approve tokens
      await mockSand.connect(user).approve(sandPaymentGateway.address, amount);

      // Calculate expected amounts
      const expectedFee = amount.mul(FEE_BASIS_POINTS).div(10000);
      const expectedNet = amount.sub(expectedFee);

      // Get initial balances
      const initialOwnerBalance = await mockSand.balanceOf(owner.address);
      const initialFeeRecipientBalance = await mockSand.balanceOf(feeRecipient.address);

      // Execute pay
      await expect(sandPaymentGateway.connect(user).pay(orderId, amount, feeRecipient.address))
        .to.emit(sandPaymentGateway, "PaymentDone")
        .withArgs(orderId, user.address, amount);

      // Check balances
      expect(await mockSand.balanceOf(owner.address)).to.equal(initialOwnerBalance.add(expectedNet));
      expect(await mockSand.balanceOf(feeRecipient.address)).to.equal(initialFeeRecipientBalance.add(expectedFee));

      // Check order is marked as processed
      expect(await sandPaymentGateway.processed(orderId)).to.be.true;
    });

    it("Should revert with insufficient allowance", async function () {
      await expect(
        sandPaymentGateway.connect(user).pay(orderId, amount, feeRecipient.address)
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });
  });


  describe("Admin functions", function () {
    it("Should update fee basis points", async function () {
      const newFee = 200; // 2%
      await expect(sandPaymentGateway.connect(owner).updateFee(newFee))
        .to.emit(sandPaymentGateway, "FeeUpdated")
        .withArgs(newFee);

      expect(await sandPaymentGateway.feeBasisPoints()).to.equal(newFee);
    });

    it("Should revert fee update with invalid fee", async function () {
      await expect(
        sandPaymentGateway.connect(owner).updateFee(1001)
      ).to.be.revertedWithCustomError(sandPaymentGateway, "InvalidFee");
    });

    it("Should update fee recipient", async function () {
      await expect(sandPaymentGateway.connect(owner).updateFeeRecipient(other.address))
        .to.emit(sandPaymentGateway, "FeeRecipientUpdated")
        .withArgs(other.address);

      expect(await sandPaymentGateway.feeRecipient()).to.equal(other.address);
    });

    it("Should emergency withdraw", async function () {
      // First make a payment to have balance
      const amount = ethers.utils.parseEther("100");
      const orderId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("emergency-test"));
      
      await mockSand.connect(user).approve(sandPaymentGateway.address, amount);
      await sandPaymentGateway.connect(user).pay(orderId, amount, feeRecipient.address);

      const contractBalance = await sandPaymentGateway.getBalance();
      const initialOwnerBalance = await mockSand.balanceOf(owner.address);

      await sandPaymentGateway.connect(owner).emergencyWithdraw(contractBalance);

      expect(await sandPaymentGateway.getBalance()).to.equal(0);
      expect(await mockSand.balanceOf(owner.address)).to.equal(initialOwnerBalance.add(contractBalance));
    });
  });

  describe("View functions", function () {
    it("Should return correct balance", async function () {
      expect(await sandPaymentGateway.getBalance()).to.equal(0);

      // Make a payment
      const amount = ethers.utils.parseEther("100");
      const orderId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("balance-test"));
      
      await mockSand.connect(user).approve(sandPaymentGateway.address, amount);
      await sandPaymentGateway.connect(user).pay(orderId, amount, feeRecipient.address);

      // Balance should be 0 since everything is distributed
      expect(await sandPaymentGateway.getBalance()).to.equal(0);
    });

    it("Should return correct processed status", async function () {
      const orderId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("status-test"));
      
      expect(await sandPaymentGateway.isProcessed(orderId)).to.be.false;

      // Make a payment
      const amount = ethers.utils.parseEther("100");
      await mockSand.connect(user).approve(sandPaymentGateway.address, amount);
      await sandPaymentGateway.connect(user).pay(orderId, amount, feeRecipient.address);

      expect(await sandPaymentGateway.isProcessed(orderId)).to.be.true;
    });
  });
});
