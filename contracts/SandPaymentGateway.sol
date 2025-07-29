// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SandPaymentGateway
 * @dev Gateway contract for processing $SAND payments with EIP-2612 permit support
 * @notice Allows users to pay with $SAND tokens using permit signatures or traditional approvals
 */
contract SandPaymentGateway is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // State variables
    IERC20Permit public immutable sand;
    uint16 public feeBasisPoints; // ex. 100 = 1%
    address public feeRecipient;
    mapping(bytes32 => bool) public processed;

    // Events
    event PaymentDone(bytes32 indexed orderId, address indexed payer, uint256 amount);
    event FeeUpdated(uint16 newFeeBasisPoints);
    event FeeRecipientUpdated(address newFeeRecipient);

    // Errors
    error AlreadyProcessed();
    error InvalidFee();
    error ZeroAmount();
    error ZeroAddress();

    /**
     * @dev Constructor
     * @param _sand Address of the $SAND token contract
     * @param _feeBasisPoints Fee in basis points (max 1000 = 10%)
     * @param _feeRecipient Address to receive fees
     */
    constructor(
        address _sand,
        uint16 _feeBasisPoints,
        address _feeRecipient
    ) Ownable(msg.sender) {
        if (_sand == address(0) || _feeRecipient == address(0)) {
            revert ZeroAddress();
        }
        if (_feeBasisPoints > 1000) {
            revert InvalidFee();
        }

        sand = IERC20Permit(_sand);
        feeBasisPoints = _feeBasisPoints;
        feeRecipient = _feeRecipient;
    }

    /**
     * @dev Pay with EIP-2612 permit signature
     * @param orderId Unique order identifier
     * @param amount Amount of $SAND to pay
     * @param deadline Permit deadline
     * @param v Signature v component
     * @param r Signature r component
     * @param s Signature s component
     */
    function payWithPermit(
        bytes32 orderId,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address feeRecipient_
    ) external nonReentrant {
        if (amount == 0) {
            revert ZeroAmount();
        }

        // Execute permit
        sand.permit(msg.sender, address(this), amount, deadline, v, r, s);
        
        // Transfer tokens from user to contract
        IERC20(address(sand)).safeTransferFrom(msg.sender, address(this), amount);

        // Process payment
        _processPayment(orderId, msg.sender, amount, feeRecipient_);
    }

    /**
     * @dev Pay with traditional approval (for wallets without EIP-2612)
     * @param orderId Unique order identifier
     * @param amount Amount of $SAND to pay
     */
    function pay(bytes32 orderId, uint256 amount, address feeRecipient_) external nonReentrant {
        if (amount == 0) {
            revert ZeroAmount();
        }

        // Transfer tokens from user to contract
        IERC20(address(sand)).safeTransferFrom(msg.sender, address(this), amount);

        // Process payment
        _processPayment(orderId, msg.sender, amount, feeRecipient_);
    }

    /**
     * @dev Update fee basis points (owner only)
     * @param _feeBasisPoints New fee in basis points (max 1000 = 10%)
     */
    function updateFee(uint16 _feeBasisPoints) external onlyOwner {
        if (_feeBasisPoints > 1000) {
            revert InvalidFee();
        }
        feeBasisPoints = _feeBasisPoints;
        emit FeeUpdated(_feeBasisPoints);
    }

    /**
     * @dev Update fee recipient (owner only)
     * @param _feeRecipient New fee recipient address
     */
    function updateFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) {
            revert ZeroAddress();
        }
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    /**
     * @dev Emergency withdraw function (owner only)
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        if (amount == 0) {
            revert ZeroAmount();
        }
        // Transfer available balance (will revert if insufficient)
        IERC20(address(sand)).safeTransfer(owner(), amount);
    }

    /**
     * @dev Internal function to process payment
     * @param orderId Unique order identifier
     * @param payer Address of the payer
     * @param amount Amount being paid
     */
    function _processPayment(
        bytes32 orderId,
        address payer,
        uint256 amount,
        address feeRecipient_
    ) internal {
        if (processed[orderId]) {
            revert AlreadyProcessed();
        }

        // Mark as processed
        processed[orderId] = true;

        // Note: tokens should already be transferred to contract by calling function
        
        // Calculate fee and net amount
        uint256 fee = (amount * feeBasisPoints) / 10_000;
        uint256 net = amount - fee;

        // Transfer fee to fee recipient
        if (fee > 0) {
            require(feeRecipient_ != address(0), "Invalid feeRecipient");
            IERC20(address(sand)).safeTransfer(feeRecipient_, fee);
        }

        // Transfer net amount to owner
        if (net > 0) {
            IERC20(address(sand)).safeTransfer(owner(), net);
        }

        // Emit payment event
        emit PaymentDone(orderId, payer, amount);
    }

    /**
     * @dev Get contract balance
     * @return Current $SAND balance of the contract
     */
    function getBalance() external view returns (uint256) {
        return IERC20(address(sand)).balanceOf(address(this));
    }

    /**
     * @dev Check if an order has been processed
     * @param orderId Order identifier to check
     * @return True if processed, false otherwise
     */
    function isProcessed(bytes32 orderId) external view returns (bool) {
        return processed[orderId];
    }
}
