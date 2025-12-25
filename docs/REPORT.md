CapShield v2 – Smart Contract Implementation Report
Overview

This report documents the CapShield v2 smart contract implementation, focusing on:

ShieldToken (CAPY) v2

CapShieldVesting v2

The primary objective of this iteration was to fix and harden the core economic primitives of the protocol token minting constraints, transfer mechanics, and vesting correctness — before extending the system with DAO governance, treasury automation, staking, and community token logic.

All implemented functionality is fully covered by automated tests and verified via Hardhat.


Scope of This Implementation
Implemented- 
ShieldToken (CAPY) v2
CapShieldVesting v2
Comprehensive Hardhat test coverage
Gas usage analysis

Deferred (Explicitly Out of Scope)
Community Token (SEED)
DAO / Governor contracts
Treasury buyback automation
Staking contracts
AI / Oracle integrations

These components depend on correct and secure base token and vesting logic, which is why this iteration focuses on foundational correctness first.



ShieldToken (CAPY) v2
Token Configuration
Name: CapShield Token
Symbol: CAPY
Decimals: 18
Maximum Supply: 100,000,000 tokens (hard cap)

The maximum supply is enforced at the protocol level and cannot be exceeded under any circumstances.


Hard Cap Enforcement

A cumulative counter (mintedEver) tracks all tokens ever minted.
Key properties:
Minting above the hard cap reverts
Burning tokens does not restore mint capacity
The cap is irreversible

This behavior is explicitly tested, including the case where tokens are burned and further minting is attempted.


Access Control & Roles

ShieldToken uses OpenZeppelin AccessControl.
Defined roles:
DEFAULT_ADMIN_ROLE – protocol admin (intended to be multisig in production)
ADMIN_MINT_ROLE – off-chain / allocation minting
USER_MINT_ROLE – backend signer for user minting
REVENUE_MINT_ROLE – revenue-based minting
TREASURY_ROLE – treasury address
DAO_ROLE – DAO address

Unauthorized access to minting functions is strictly prevented and verified by tests.


Admin (Off-chain) Minting

Purpose:
Record off-chain allocations such as SAFTs, OTC deals, or fiat settlements on-chain.

Function:

adminMint(address to, uint256 amount, string reason)


Properties:
Restricted to ADMIN_MINT_ROLE
Respects the global hard cap
Emits OffchainMint event
Blocked when contract is paused

This functionality is fully tested.



User Minting (API / Backend-Approved)

User minting is implemented using EIP-712 typed signatures.

Flow:
Backend signs a mint authorization
User submits the signed request
Contract verifies:
Signature validity
Nonce (replay protection)
Deadline (expiry protection)
Tokens are minted if valid

Properties:

Nonce-based replay protection
Signature validation using EIP-712
Emits UserMint event
Blocked when paused

All edge cases (invalid signer, replay, expired signature) are tested.



Revenue-Based Minting

Function:
revenueMint(uint256 revenue, uint256 marketValue)


Formula:
mintedAmount = revenue / marketValue


Properties:

Revenue and market value must be greater than zero
Minted amount must be non-zero
Respects global hard cap
Tokens are minted directly to treasury
Emits RevenueMint event
Blocked when paused

This logic is fully implemented and tested.


Transfer Hooks: Burn & Treasury Allocation

On every non-exempt transfer:
1% of the amount is burned
1% is sent to the treasury
98% reaches the recipient

Exemptions:

Treasury transfers
DAO transfers
Admin and explicitly exempted addresses

Effects:
Total supply is reduced correctly
Treasury balance increases correctly
Exempt transfers bypass fee logic

All transfer mechanics and exemptions are covered by tests.


Pause & Emergency Controls
ShieldToken implements Pausable.

Capabilities:
Admin can pause and unpause the contract

When paused:
Admin minting is blocked
User minting is blocked
Revenue minting is blocked
Transfers are blocked

This ensures emergency control in case of protocol risk. Behavior is verified by tests.


CapShieldVesting v2
Design Goals
Secure, deterministic vesting logic
No minting inside vesting contract
Protection against double claims
Reusable for multiple allocations and projects

Vesting Model
Configuration:
Cliff: 36 months
Linear vesting: 50 months
Total duration: 86 months

Rules:
No tokens claimable before cliff
Linear release after cliff
100% claimable after vesting ends
Pull-based claiming by beneficiary

Vesting Formula

Let:
allocation = total allocated tokens
start = vesting start timestamp
cliffEnd = start + 36 months
vestingEnd = cliffEnd + 50 months

Logic:

If now < cliffEnd: claimable = 0
If now >= vestingEnd: claimable = allocation

Else:
vested = allocation * (now - cliffEnd) / vestingDuration
claimable = vested - alreadyClaimed


Security Properties

Tokens must be transferred to vesting contract before creating vesting
No minting inside vesting contract
Claimed amount tracked per beneficiary
Reentrancy protected
Optional emergency revoke supported
Unvested tokens returned on revoke

Vesting Tests

The following scenarios are fully tested:
Vesting creation only after funding
Claim blocked before cliff
Partial claim during vesting
Full claim after vesting completion
Revoke and block further claims


Test Coverage Summary

All implemented functionality is validated by automated tests.
Test results:

20 passing tests

ShieldToken v2 fully covered
CapShieldVesting v2 fully covered
Hard cap, minting, fees, pause, and vesting behavior validated
Gas usage is reported for all key functions.

Deferred Components

The following components are intentionally deferred to later phases:
Community Token (SEED)
DAO governance (OpenZeppelin Governor)
Treasury buyback automation
Staking contracts
AI / Oracle-driven logic

These features depend on the correctness of the token and vesting layer implemented in this phase.

Conclusion

This implementation delivers a production-ready foundation for the CapShield protocol by ensuring:
Strict and irreversible supply control
Secure and auditable minting paths
Correct economic behavior on transfers
Robust, test-proven vesting logic

With these core guarantees in place, higher-level governance, staking, and treasury automation can be safely built in subsequent iterations.

