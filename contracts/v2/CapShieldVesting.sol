// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract CapShieldVesting is ReentrancyGuard, Pausable, AccessControl {
    IERC20 public immutable token;

    bytes32 public constant VESTING_ADMIN_ROLE = keccak256("VESTING_ADMIN_ROLE");

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
    event EmergencyWithdraw(address indexed to, uint256 amount);

    constructor(address tokenAddress, address admin) {
        require(tokenAddress != address(0), "Invalid token");
        require(admin != address(0), "Invalid admin");

        token = IERC20(tokenAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VESTING_ADMIN_ROLE, admin);
    }

    function createVesting(address beneficiary, uint256 allocation) external onlyRole(VESTING_ADMIN_ROLE) whenNotPaused {
        require(beneficiary != address(0), "Invalid address");
        require(allocation > 0, "Zero allocation");
        require(vestings[beneficiary].totalAllocation == 0, "Already vested");

        uint256 newTotalAllocated = totalAllocated + allocation;
        require(token.balanceOf(address(this)) >= newTotalAllocated, "Insufficient funding");

        vestings[beneficiary] = Vesting({
            totalAllocation: allocation,
            claimed: 0,
            startTime: block.timestamp,
            revoked: false
        });

        totalAllocated = newTotalAllocated;

        emit VestingCreated(beneficiary, allocation, block.timestamp);
    }

    function claim() external nonReentrant whenNotPaused {
        Vesting storage v = vestings[msg.sender];
        require(v.totalAllocation > 0, "No vesting");
        require(!v.revoked, "Vesting revoked");

        uint256 claimable = claimableAmount(msg.sender);
        require(claimable > 0, "Nothing to claim");

        v.claimed += claimable;
        totalClaimed += claimable;

        require(token.transfer(msg.sender, claimable), "Transfer failed");

        emit TokensClaimed(msg.sender, claimable);
    }

    function claimableAmount(address beneficiary) public view returns (uint256) {
        Vesting memory v = vestings[beneficiary];
        if (v.totalAllocation == 0 || v.revoked) return 0;

        uint256 cliffEnd = v.startTime + CLIFF_DURATION;
        if (block.timestamp < cliffEnd) return 0;

        uint256 vestingEnd = cliffEnd + VESTING_DURATION;

        uint256 vested;
        if (block.timestamp >= vestingEnd) {
            vested = v.totalAllocation;
        } else {
            vested = (v.totalAllocation * (block.timestamp - cliffEnd)) / VESTING_DURATION;
        }

        if (vested <= v.claimed) return 0;
        return vested - v.claimed;
    }

    function revoke(address beneficiary) external onlyRole(VESTING_ADMIN_ROLE) whenNotPaused {
        Vesting storage v = vestings[beneficiary];
        require(v.totalAllocation > 0, "No vesting");
        require(!v.revoked, "Already revoked");

        uint256 vested = v.claimed + claimableAmount(beneficiary);
        uint256 unvested = v.totalAllocation - vested;

        v.revoked = true;

        emit VestingRevoked(beneficiary, unvested);
    }

    function pause() external onlyRole(VESTING_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(VESTING_ADMIN_ROLE) {
        _unpause();
    }

    function emergencyWithdraw(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "Invalid address");
        require(token.transfer(to, amount), "Transfer failed");
        emit EmergencyWithdraw(to, amount);
    }
}
