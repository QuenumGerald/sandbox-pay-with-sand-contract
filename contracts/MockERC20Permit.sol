// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title MockERC20Permit
 * @dev Mock ERC20 token with EIP-2612 permit functionality for testing
 * @notice This contract simulates the $SAND token behavior for testing purposes
 */
contract MockERC20Permit is ERC20, ERC20Permit {
    /**
     * @dev Constructor
     * @param name Token name
     * @param symbol Token symbol
     * @param initialSupply Initial token supply
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20(name, symbol) ERC20Permit(name) {
        _mint(msg.sender, initialSupply);
    }

    /**
     * @dev Mint tokens to a specific address (for testing purposes)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /**
     * @dev Get the chain ID for permit functionality
     * @return The current chain ID
     */
    function getChainId() external view returns (uint256) {
        return block.chainid;
    }
}
