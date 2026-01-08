// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

interface IShieldToken {
    function setVestingContract(address vesting) external;
}

contract CapShieldVesting is ReentrancyGuard, Pausable, AccessControl {
    IERC20 public immutable token;
    address public immutable treasury;

    bytes32 public constant VESTING_ADMIN_ROLE =
        keccak256("VESTING_ADMIN_ROLE");

    uint256 public constant CLIFF_DURATION = 36 * 30 days;
    uint256 public constant VESTING_DURATION = 50 * 30 days;

    struct Vesting {
        uint256 totalAllocation;
        uint256 claimed;
        uint256 startTime;
        bool revoked;
    }

    mapping(address => Vesting) public vestings;

    uint256 public totalAllocated;
    uint256 public totalClaimed;

    event VestingCreated(address indexed beneficiary, uint256 amount, uint256 startTime);
    event TokensClaimed(address indexed beneficiary, uint256 amount);
    event VestingRevoked(address indexed beneficiary, uint256 unvestedAmount);

    constructor(
        address tokenAddress,
        address admin,
        address treasuryAddress
    ) {
        token = IERC20(tokenAddress);
        treasury = treasuryAddress;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VESTING_ADMIN_ROLE, admin);

        IShieldToken(tokenAddress).setVestingContract(address(this));
    }

    function createVesting(
        address beneficiary,
        uint256 allocation
    ) external onlyRole(VESTING_ADMIN_ROLE) whenNotPaused {
        require(beneficiary != address(0), "Invalid address");
        require(allocation > 0, "Zero allocation");
        require(vestings[beneficiary].totalAllocation == 0, "Already vested");

        uint256 required = (totalAllocated - totalClaimed) + allocation;
        require(token.balanceOf(address(this)) >= required, "Insufficient funding");

        vestings[beneficiary] = Vesting({
            totalAllocation: allocation,
            claimed: 0,
            startTime: block.timestamp,
            revoked: false
        });

        totalAllocated += allocation;
        emit VestingCreated(beneficiary, allocation, block.timestamp);
    }

    function claim() external nonReentrant whenNotPaused {
        Vesting storage v = vestings[msg.sender];
        require(v.totalAllocation > 0, "No vesting");

        uint256 amount = claimableAmount(msg.sender);
        require(amount > 0, "Nothing to claim");

        v.claimed += amount;
        totalClaimed += amount;

        require(token.transfer(msg.sender, amount), "Transfer failed");
        emit TokensClaimed(msg.sender, amount);
    }

    function revoke(address beneficiary)
        external
        onlyRole(VESTING_ADMIN_ROLE)
        whenNotPaused
    {
        Vesting storage v = vestings[beneficiary];
        require(v.totalAllocation > 0, "No vesting");
        require(!v.revoked, "Already revoked");

        uint256 vested = _vestedAmount(v, block.timestamp);
        if (vested < v.claimed) vested = v.claimed;

        uint256 unvested = v.totalAllocation - vested;

        v.revoked = true;
        v.totalAllocation = vested;

        if (unvested > 0) {
            totalAllocated -= unvested;
            require(token.transfer(treasury, unvested), "Transfer failed");
        }

        emit VestingRevoked(beneficiary, unvested);
    }

    function pause() external onlyRole(VESTING_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(VESTING_ADMIN_ROLE) {
        _unpause();
    }

    function getVesting(address user)
        external
        view
        returns (
            uint256 totalAllocation,
            uint256 claimed,
            uint256 startTime,
            uint256 cliffEnd,
            uint256 vestingEnd,
            bool revoked
        )
    {
        Vesting memory v = vestings[user];
        if (v.totalAllocation == 0) {
            return (0, 0, 0, 0, 0, false);
        }

        uint256 ce = v.startTime + CLIFF_DURATION;
        uint256 ve = ce + VESTING_DURATION;

        return (v.totalAllocation, v.claimed, v.startTime, ce, ve, v.revoked);
    }

    function claimableAmount(address user) public view returns (uint256) {
        Vesting memory v = vestings[user];
        if (v.totalAllocation == 0) return 0;

        uint256 vested = _vestedAmount(v, block.timestamp);
        if (vested <= v.claimed) return 0;

        return vested - v.claimed;
    }

    function lockedAmount(address user) external view returns (uint256) {
        Vesting memory v = vestings[user];
        if (v.totalAllocation == 0) return 0;

        return v.totalAllocation - v.claimed - claimableAmount(user);
    }

    function vestingProgress(address user) external view returns (uint256) {
        Vesting memory v = vestings[user];
        if (v.totalAllocation == 0) return 0;

        uint256 vested = _vestedAmount(v, block.timestamp);
        if (vested >= v.totalAllocation) return 100;

        return (vested * 100) / v.totalAllocation;
    }

    function weeksLeft(address user) external view returns (uint256) {
        Vesting memory v = vestings[user];
        if (v.totalAllocation == 0) return 0;

        uint256 end = v.startTime + CLIFF_DURATION + VESTING_DURATION;
        if (block.timestamp >= end) return 0;

        return (end - block.timestamp + 6 days) / 7 days;
    }

    function nextUnlockTime(address user) external view returns (uint256) {
        Vesting memory v = vestings[user];
        if (v.totalAllocation == 0) return 0;

        uint256 cliffEnd = v.startTime + CLIFF_DURATION;
        if (block.timestamp < cliffEnd) return cliffEnd;

        uint256 end = cliffEnd + VESTING_DURATION;
        if (block.timestamp >= end) return 0;

        uint256 elapsed = block.timestamp - cliffEnd;
        uint256 next = cliffEnd + ((elapsed / 7 days) + 1) * 7 days;
        if (next > end) return end;

        return next;
    }

    function _vestedAmount(
        Vesting memory v,
        uint256 ts
    ) internal pure returns (uint256) {
        uint256 cliffEnd = v.startTime + CLIFF_DURATION;
        if (ts < cliffEnd) return 0;

        uint256 vestingEnd = cliffEnd + VESTING_DURATION;
        if (ts >= vestingEnd) return v.totalAllocation;

        uint256 elapsed = ts - cliffEnd;
        return (v.totalAllocation * elapsed) / VESTING_DURATION;
    }
}
