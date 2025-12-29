const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const SHIELD_TOKEN_ADDRESS = "0x2A80E81612bd8C2d1169E305153B55240b6D2C27";

  console.log("Deployer:", deployer.address);
  console.log("Deploying vesting with token:", SHIELD_TOKEN_ADDRESS);

  const CapShieldVesting = await hre.ethers.getContractFactory("CapShieldVesting");
  const vesting = await CapShieldVesting.deploy(SHIELD_TOKEN_ADDRESS, deployer.address);

  await vesting.waitForDeployment();

  console.log("CapShieldVesting deployed:", vesting.target);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
