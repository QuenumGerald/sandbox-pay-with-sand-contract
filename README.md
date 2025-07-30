# sandbox-pay-with-sand-contract

This repository contains a Hardhat project with a single Solidity contract `SandPaymentGateway`. The contract allows applications to collect payments in **$SAND** tokens and supports both [EIP‑2612](https://eips.ethereum.org/EIPS/eip-2612) permit signatures as well as regular ERC‑20 approvals.

## Features

- Accept payments with or without a permit signature
- Configurable fee percentage and fee recipient
- Tracks processed order IDs to avoid duplicates
- Owner can withdraw tokens held by the gateway

## Contract summary

`SandPaymentGateway` lets users pay an order by transferring tokens to the contract. The owner receives the net amount and a configurable percentage fee is forwarded to a dedicated fee recipient. Each order ID can be processed only once.

### State variables

| Variable | Description |
|----------|-------------|
| `sand` | Address of the $SAND token implementing `IERC20Permit` |
| `feeBasisPoints` | Fee percentage in basis points (1% = 100) |
| `feeRecipient` | Address receiving collected fees |
| `processed` | Mapping of processed order IDs |

### Key functions

| Function | Description |
|----------|-------------|
| `payWithPermit(orderId, amount, deadline, v, r, s)` | Pay using an off‑chain permit signature. |
| `pay(orderId, amount)` | Pay using a standard `approve` + `pay` sequence. |
| `updateFee(_feeBasisPoints)` | Owner‑only function to change the fee (max 10%). |
| `updateFeeRecipient(_feeRecipient)` | Owner‑only function to change where fees are sent. |
| `emergencyWithdraw(amount)` | Owner‑only function to withdraw tokens from the contract. |
| `getBalance()` | View the current token balance held by the gateway. |
| `isProcessed(orderId)` | Check whether an order has already been processed. |

### Events

- `PaymentDone(bytes32 orderId, address payer, uint256 amount)` – emitted for each successful payment.
- `FeeUpdated(uint16 newFeeBasisPoints)` – emitted when the owner updates the fee.
- `FeeRecipientUpdated(address newFeeRecipient)` – emitted when the owner updates the fee recipient.

### Errors

- `AlreadyProcessed` – the order ID has already been paid.
- `InvalidFee` – the fee exceeds the allowed limit.
- `ZeroAmount` – the payment or withdrawal amount is zero.
- `ZeroAddress` – an address parameter is the zero address.

## Setup

1. Copy `.env.example` to `.env` and fill in the required values (RPC URLs, `PRIVATE_KEY`, optional explorer API keys).
2. Install dependencies and compile the contracts:

```bash
npm install
npx hardhat compile
```

## Development

After setup you can run the Hardhat test suite and deploy scripts:

```bash
npx hardhat test
npx hardhat run scripts/deploy.ts --network <network>
```

Network RPC URLs and keys are taken from `.env` (see `hardhat.config.ts`). Additional helper scripts live in the `scripts/` directory.

## Usage example

A payment flow with permit looks like:

```solidity
bytes32 orderId = ...;
uint256 amount = 100 ether;
uint256 deadline = block.timestamp + 1 hours;
(uint8 v, bytes32 r, bytes32 s) = /* signature from user */;
address feeRecipient = ...;

// Note: feeRecipient is now required in payWithPermit
sandPaymentGateway.payWithPermit(orderId, amount, deadline, v, r, s, feeRecipient);
```

You can also use the traditional `approve` + `pay` flow:

```solidity
bytes32 orderId = ...;
uint256 amount = 50 ether;
address feeRecipient = ...;

// User approves the gateway to spend tokens
sandToken.approve(address(sandPaymentGateway), amount);

// Note: feeRecipient is now required in pay
sandPaymentGateway.pay(orderId, amount, feeRecipient);
```

The gateway distributes the fee and transfers the net amount to the contract owner. Each `orderId` can only be used once.

---

## Base Sepolia Integration Test

A full integration test is available for the Base Sepolia network:

```bash
npx hardhat run scripts/test-base-sepolia.ts --network baseSepolia
```

### Important Notes
- **Do NOT run this script with `ts-node`**: It requires Hardhat's runtime environment (hre.ethers). Always use `npx hardhat run ...`.
- **Always await approve**: After calling `approve`, always wait for the transaction to be mined before calling `pay`. Example:
  ```typescript
  const approveTx = await token.approve(gateway.address, amount);
  await approveTx.wait();
  ```
- **Function signatures**: Both `pay` and `payWithPermit` now require a `feeRecipient` as the last argument.
- **EIP-2612 permit**: The script demonstrates both traditional and permit-based flows for payment.
- **Order IDs**: Each orderId must be unique and never reused.

### Troubleshooting
- **Error: no matching fragment (pay/payWithPermit)**: Check that you are passing all required arguments, especially `feeRecipient`.
- **Allowance is 0 before pay**: Make sure you wait for the approve transaction to be mined before calling `pay`.
- **hre.ethers not found**: Only available when running via Hardhat (`npx hardhat run`).
- **Permit signature invalid**: Ensure the domain, types, and values match your token and network.

---

