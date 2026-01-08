cat > docs/BASELINE_SETUP.md <<'EOF'
# Baseline Setup (v1)

## Environment
- Repo: capshield-smart-contract (fork)
- Branch: dev-dhruv
- Hardhat: 2.27.0 (local)
- Solidity: 0.8.19
- OS: macOS

## Install
```bash
npm install

Compile
npx hardhat compile

Test
npx hardhat test

Observed Failure (before fixes)

Error:
TypeError: (0 , ethers_1.getAddress) is not a function

Location:
node_modules/@nomicfoundation/hardhat-ethers/src/signers.ts


Notes-
This indicates an ethers v5/v6 toolchain mismatch (Hardhat ethers plugin expecting ethers v6 APIs).
EOF


### 2) Create `docs/BASELINE_TEST_FAILURE.md`
```bash
cat > docs/BASELINE_TEST_FAILURE.md <<'EOF'
# Baseline Test Failure (v1)

## Summary
The provided v1 repo fails tests due to dependency mismatch, before we even validate token logic.

## Failure Log
```txt
TypeError: (0 , ethers_1.getAddress) is not a function
  at new HardhatEthersSigner (.../node_modules/@nomicfoundation/hardhat-ethers/src/signers.ts:97:30)
  at getSigners (.../node_modules/@nomicfoundation/hardhat-ethers/src/internal/helpers.ts:58:30)
  at Context.<anonymous> (test/Token.test.js:9:29)


Root Cause (Tooling)
@nomicfoundation/hardhat-ethers expects ethers v6
repo currently uses ethers v5 in dependencies
also includes @nomiclabs/hardhat-ethers which conflicts

Impact
Prevents all baseline validations from running
Must be fixed before functional testing against v2 spec
EOF


## Step 2B — Commit the “v1 preserved” changes
```bash
git status
git add .
git commit -m "chore: preserve v1 contracts/tests and add baseline docs"
git push
