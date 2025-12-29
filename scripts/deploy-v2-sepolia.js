const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deployer:", deployer.address);
  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance (wei):", bal.toString());

  // For testnet we can use deployer as all role addresses
  const admin = deployer.address;
  const treasury = deployer.address;
  const dao = deployer.address;
  const backendSigner = deployer.address;

  // Deploy ShieldToken (v2)
  const ShieldToken = await hre.ethers.getContractFactory("ShieldToken");
  const shield = await ShieldToken.deploy(admin, treasury, dao, backendSigner);
  await shield.waitForDeployment();
  const shieldAddress = await shield.getAddress();
  console.log("ShieldToken (CAPY) deployed:", shieldAddress);

  // Deploy CapShieldVesting (v2)
  const CapShieldVesting = await hre.ethers.getContractFactory("CapShieldVesting");
  const vesting = await CapShieldVesting.deploy(shieldAddress);
  await vesting.waitForDeployment();
  const vestingAddress = await vesting.getAddress();
  console.log("CapShieldVesting deployed:", vestingAddress);

  console.log("\nConstructor args (save for verification):");
  console.log("ShieldToken:", admin, treasury, dao, backendSigner);
  console.log("CapShieldVesting:", shieldAddress);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
