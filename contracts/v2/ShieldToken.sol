// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract ShieldToken is ERC20, Pausable, AccessControl, EIP712 {
    using ECDSA for bytes32;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint8 private constant _DECIMALS = 18;
    uint256 public constant MAX_SUPPLY = 100_000_000 * 1e18;

    address public immutable treasury;
    address public immutable dao;
    address public immutable backendSigner;

    address public vestingContract;

    uint256 public mintedEver;

    mapping(address => uint256) public nonces;
    mapping(address => bool) public feeExempt;

    event OffchainMint(address indexed to, uint256 amount, string reason);
    event UserMint(address indexed to, uint256 amount);
    event RevenueMint(uint256 revenue, uint256 bps, uint256 minted);

    constructor(
        address admin,
        address treasuryAddress,
        address daoAddress,
        address signer
    ) ERC20("CapShield Token", "CAPY") EIP712("CapShield Token", "1") {
        treasury = treasuryAddress;
        dao = daoAddress;
        backendSigner = signer;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        feeExempt[treasuryAddress] = true;
        feeExempt[daoAddress] = true;
        feeExempt[address(this)] = true;
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    function setVestingContract(address vesting) external {
        require(vestingContract == address(0), "Vesting already set");
        require(vesting != address(0), "Invalid vesting");
        vestingContract = vesting;
        feeExempt[vesting] = true;
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function burn(uint256 amount) external whenNotPaused {
        _burn(msg.sender, amount);
    }

    function adminMint(
        address to,
        uint256 amount,
        string calldata reason
    ) external onlyRole(ADMIN_ROLE) whenNotPaused {
        _capMint(to, amount);
        emit OffchainMint(to, amount, reason);
    }

    function userMint(
        uint256 amount,
        uint256 deadline,
        bytes calldata sig
    ) external whenNotPaused {
        require(block.timestamp <= deadline, "Expired");

        uint256 nonce = nonces[msg.sender];

        bytes32 typeHash =
            keccak256("Mint(address to,uint256 amount,uint256 nonce,uint256 deadline)");
        bytes32 structHash =
            keccak256(abi.encode(typeHash, msg.sender, amount, nonce, deadline));
        bytes32 digest = _hashTypedDataV4(structHash);

        address recovered = digest.recover(sig);
        require(recovered == backendSigner, "Invalid signer");

        nonces[msg.sender] = nonce + 1;

        _capMint(msg.sender, amount);
        emit UserMint(msg.sender, amount);
    }

    function revenueMint(
        uint256 revenue,
        uint256 bps
    ) external onlyRole(ADMIN_ROLE) whenNotPaused {
        uint256 minted = revenue / bps;
        _capMint(treasury, minted);
        emit RevenueMint(revenue, bps, minted);
    }

    function _capMint(address to, uint256 amount) internal {
        uint256 next = mintedEver + amount;
        require(next <= MAX_SUPPLY, "Cap reached");
        mintedEver = next;
        _mint(to, amount);
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        if (
            feeExempt[from] ||
            feeExempt[to] ||
            from == vestingContract ||
            to == vestingContract
        ) {
            super._transfer(from, to, amount);
            return;
        }

        uint256 burnAmount = amount / 100;
        uint256 treasuryAmount = amount / 100;
        uint256 sendAmount = amount - burnAmount - treasuryAmount;

        super._burn(from, burnAmount);
        super._transfer(from, treasury, treasuryAmount);
        super._transfer(from, to, sendAmount);
    }
}
