// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract ShieldToken is ERC20, ERC20Burnable, Pausable, AccessControl, EIP712 {
    bytes32 public constant ADMIN_MINT_ROLE = keccak256("ADMIN_MINT_ROLE");
    bytes32 public constant USER_MINT_ROLE = keccak256("USER_MINT_ROLE");
    bytes32 public constant REVENUE_MINT_ROLE = keccak256("REVENUE_MINT_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 public constant DAO_ROLE = keccak256("DAO_ROLE");

    uint256 public constant MAX_SUPPLY = 100_000_000 * 10 ** 18;

    address public treasury;
    uint256 public mintedEver;

    mapping(address => bool) public feeExempt;
    mapping(address => uint256) public nonces;

    bytes32 private constant MINT_TYPEHASH =
        keccak256("Mint(address to,uint256 amount,uint256 nonce,uint256 deadline)");

    event OffchainMint(address indexed to, uint256 amount, string reason);
    event UserMint(address indexed user, uint256 amount);
    event RevenueMint(uint256 revenue, uint256 marketValue, uint256 mintedAmount);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event FeeExemptUpdated(address indexed account, bool exempt);

    constructor(
        address admin,
        address treasuryAddress,
        address daoAddress,
        address backendSigner
    ) ERC20("CapShield Token", "CAPY") EIP712("CapShield Token", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_MINT_ROLE, admin);
        _grantRole(REVENUE_MINT_ROLE, admin);

        _grantRole(USER_MINT_ROLE, backendSigner);
        _grantRole(TREASURY_ROLE, treasuryAddress);
        _grantRole(DAO_ROLE, daoAddress);

        treasury = treasuryAddress;

        feeExempt[admin] = true;
        feeExempt[treasuryAddress] = true;
        feeExempt[daoAddress] = true;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newTreasury != address(0), "Invalid treasury");
        address old = treasury;
        treasury = newTreasury;
        feeExempt[newTreasury] = true;
        emit TreasuryUpdated(old, newTreasury);
    }

    function setFeeExempt(address account, bool exempt) external onlyRole(DEFAULT_ADMIN_ROLE) {
        feeExempt[account] = exempt;
        emit FeeExemptUpdated(account, exempt);
    }

    function adminMint(address to, uint256 amount, string calldata reason)
        external
        onlyRole(ADMIN_MINT_ROLE)
        whenNotPaused
    {
        _mintCapped(to, amount);
        emit OffchainMint(to, amount, reason);
    }

    function revenueMint(uint256 revenue, uint256 marketValue)
        external
        onlyRole(REVENUE_MINT_ROLE)
        whenNotPaused
        returns (uint256 mintedAmount)
    {
        require(revenue > 0, "Invalid revenue");
        require(marketValue > 0, "Invalid market value");

        mintedAmount = revenue / marketValue;
        require(mintedAmount > 0, "Zero mint");

        _mintCapped(treasury, mintedAmount);
        emit RevenueMint(revenue, marketValue, mintedAmount);
    }

    function userMint(uint256 amount, uint256 deadline, bytes calldata signature)
        external
        whenNotPaused
    {
        require(block.timestamp <= deadline, "Expired");
        require(amount > 0, "Zero mint");

        uint256 nonce = nonces[msg.sender];

        bytes32 structHash = keccak256(
            abi.encode(MINT_TYPEHASH, msg.sender, amount, nonce, deadline)
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);

        require(hasRole(USER_MINT_ROLE, signer), "Invalid signer");

        nonces[msg.sender] = nonce + 1;
        _mintCapped(msg.sender, amount);

        emit UserMint(msg.sender, amount);
    }

    function _mintCapped(address to, uint256 amount) internal {
        uint256 nextMinted = mintedEver + amount;
        require(nextMinted <= MAX_SUPPLY, "Cap reached");
        mintedEver = nextMinted;
        _mint(to, amount);
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        override
    {
        super._beforeTokenTransfer(from, to, amount);
        require(!paused(), "Paused");
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        if (amount == 0 || feeExempt[from] || feeExempt[to]) {
            super._transfer(from, to, amount);
            return;
        }

        uint256 burnAmount = amount / 100;
        uint256 treasuryAmount = amount / 100;
        uint256 sendAmount = amount - burnAmount - treasuryAmount;

        if (burnAmount > 0) {
            _burn(from, burnAmount);
        }

        if (treasuryAmount > 0) {
            super._transfer(from, treasury, treasuryAmount);
        }

        super._transfer(from, to, sendAmount);
    }
}
