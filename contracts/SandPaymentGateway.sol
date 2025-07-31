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

    mapping(bytes32 => bool) public processed;

    // Events
    event PaymentDone(bytes32 indexed orderId, address indexed payer, uint256 amount);


    // Errors
    error AlreadyProcessed();

    error ZeroAmount();
    error ZeroAddress();

    /**
     * @dev Constructor
     * @param _sand Address of the $SAND token contract
     * @param _sand Address of the $SAND token contract
     */
    constructor(address _sand) Ownable(msg.sender) {
        if (_sand == address(0)) {
            revert ZeroAddress();
        }
        sand = IERC20Permit(_sand);
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
        address recipient
    ) external nonReentrant {
        if (amount == 0) {
            revert ZeroAmount();
        }

        // Execute permit
        sand.permit(msg.sender, address(this), amount, deadline, v, r, s);
        
        // Transfer tokens from user to contract
        IERC20(address(sand)).safeTransferFrom(msg.sender, address(this), amount);

        // Process payment
        _processPayment(orderId, msg.sender, amount, recipient);
    }

    /**
     * @dev Pay with traditional approval (for wallets without EIP-2612)
     * @param orderId Unique order identifier
     * @param amount Amount of $SAND to pay
     */
    function pay(bytes32 orderId, uint256 amount, address recipient) external nonReentrant {
        if (amount == 0) {
            revert ZeroAmount();
        }

        // Transfer tokens from user to contract
        IERC20(address(sand)).safeTransferFrom(msg.sender, address(this), amount);

        // Process payment
        _processPayment(orderId, msg.sender, amount, recipient);
    }

    /**
     * @dev Update fee basis points (owner only)
     * @param _feeBasisPoints New fee in basis points (max 1000 = 10%)
     */
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
        address recipient
    ) internal {
        if (processed[orderId]) {
            revert AlreadyProcessed();
        }

        // Mark as processed
        processed[orderId] = true;

        // Note: tokens should already be transferred to contract by calling function
        
        // Transfer full amount to recipient
        require(recipient != address(0), "Invalid recipient");
        IERC20(address(sand)).safeTransfer(recipient, amount);

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
