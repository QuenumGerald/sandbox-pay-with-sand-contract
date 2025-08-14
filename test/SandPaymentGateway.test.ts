import { expect } from "chai";
import { ethers } from "hardhat";
import { parseEther, ZeroAddress, keccak256, toUtf8Bytes } from "ethers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { SandPaymentGateway, MockERC20Permit } from "../typechain-types";

describe("SandPaymentGateway", function () {
  let sandPaymentGateway: SandPaymentGateway;
  let mockSand: MockERC20Permit;
  let owner: HardhatEthersSigner;
  let recipient: HardhatEthersSigner;
  let user: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  const INITIAL_SUPPLY = parseEther("1000000");


  beforeEach(async function () {
    [owner, recipient, user, other] = await ethers.getSigners();

    // Deploy mock $SAND token with permit functionality
    const MockERC20PermitFactory = await ethers.getContractFactory("MockERC20Permit");
    mockSand = (await MockERC20PermitFactory.deploy("The Sandbox", "SAND", INITIAL_SUPPLY) as unknown) as MockERC20Permit;
    await mockSand.waitForDeployment();

    // Deploy SandPaymentGateway
    const SandPaymentGatewayFactory = await ethers.getContractFactory("SandPaymentGateway");
    sandPaymentGateway = (await SandPaymentGatewayFactory.deploy(
      await mockSand.getAddress()
    ) as unknown) as SandPaymentGateway;
    await sandPaymentGateway.waitForDeployment();

    // Transfer some tokens to user for testing
    await mockSand.transfer(user.address, parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set the correct sand token address", async function () {
      expect(await sandPaymentGateway.sand()).to.equal(await mockSand.getAddress());
    });

    it("Should set the correct owner", async function () {
      expect(await sandPaymentGateway.owner()).to.equal(owner.address);
    });

    it("Should revert with zero address for sand token", async function () {
      const SandPaymentGatewayFactory = await ethers.getContractFactory("SandPaymentGateway");
      await expect(
        SandPaymentGatewayFactory.deploy(ZeroAddress)
      ).to.be.revertedWithCustomError(sandPaymentGateway, "ZeroAddress");
    });
  });

  describe("payWithPermit", function () {
    const orderId = keccak256(toUtf8Bytes("order-123"));
    const amount = parseEther("100");

    it("Should process payment with permit successfully", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const chainId = await user.provider!.getNetwork().then(n => n.chainId);
      const domain = {
        name: await mockSand.name(),
        version: "1",
        chainId,
        verifyingContract: await mockSand.getAddress(),
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
      const value = {
        owner: user.address,
        spender: await sandPaymentGateway.getAddress(),
        value: amount,
        nonce: await mockSand.nonces(user.address),
        deadline,
      };
      // Use the correct signTypedData function for ethers v6
      const signature = await user.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      // balances before
      const recipientBefore = await mockSand.balanceOf(recipient.address);
      const contractBefore = await mockSand.balanceOf(await sandPaymentGateway.getAddress());

      // call payWithPermit
      await expect(
        sandPaymentGateway.connect(user).payWithPermit(
          orderId,
          amount,
          deadline,
          v,
          r,
          s,
          recipient.address
        )
      ).to.emit(sandPaymentGateway, "PaymentDone").withArgs(orderId, user.address, amount);

      // balances after
      const recipientAfter = await mockSand.balanceOf(recipient.address);
      const contractAfter = await mockSand.balanceOf(await sandPaymentGateway.getAddress());

      expect(recipientAfter - recipientBefore).to.equal(amount);
      expect(contractAfter).to.equal(0n);
    });

    it("Should revert for invalid recipient (zero address)", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const chainId = await user.provider!.getNetwork().then(n => n.chainId);
      const domain = {
        name: await mockSand.name(),
        version: "1",
        chainId,
        verifyingContract: await mockSand.getAddress(),
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
      const value = {
        owner: user.address,
        spender: await sandPaymentGateway.getAddress(),
        value: amount,
        nonce: await mockSand.nonces(user.address),
        deadline,
      };
      const signature = await user.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(
        sandPaymentGateway.connect(user).payWithPermit(
          orderId,
          amount,
          deadline,
          v,
          r,
          s,
          ZeroAddress
        )
      ).to.be.revertedWith("Invalid recipient");
    });
  });

  describe("pay", function () {
    const orderId = keccak256(toUtf8Bytes("order-456"));
    const amount = parseEther("200");

    it("Should process payment with approval successfully", async function () {
      await mockSand.connect(user).approve(await sandPaymentGateway.getAddress(), amount);

      const recipientBefore = await mockSand.balanceOf(recipient.address);
      const contractBefore = await mockSand.balanceOf(await sandPaymentGateway.getAddress());

      await expect(
        sandPaymentGateway.connect(user).pay(orderId, amount, recipient.address)
      ).to.emit(sandPaymentGateway, "PaymentDone").withArgs(orderId, user.address, amount);

      const recipientAfter = await mockSand.balanceOf(recipient.address);
      const contractAfter = await mockSand.balanceOf(await sandPaymentGateway.getAddress());

      expect(recipientAfter - recipientBefore).to.equal(amount);
      expect(contractAfter).to.equal(0n);
    });

    it("Should revert on duplicate orderId", async function () {
      await mockSand.connect(user).approve(await sandPaymentGateway.getAddress(), amount);
      await sandPaymentGateway.connect(user).pay(orderId, amount, recipient.address);
      await expect(
        sandPaymentGateway.connect(user).pay(orderId, amount, recipient.address)
      ).to.be.revertedWithCustomError(sandPaymentGateway, "AlreadyProcessed");
    });

    it("Should revert on zero amount", async function () {
      await expect(
        sandPaymentGateway.connect(user).pay(orderId, 0n, recipient.address)
      ).to.be.revertedWithCustomError(sandPaymentGateway, "ZeroAmount");
    });

    it("Should revert for invalid recipient (zero address)", async function () {
      await mockSand.connect(user).approve(await sandPaymentGateway.getAddress(), amount);
      await expect(
        sandPaymentGateway.connect(user).pay(orderId, amount, ZeroAddress)
      ).to.be.revertedWith("Invalid recipient");
    });
  });
});
