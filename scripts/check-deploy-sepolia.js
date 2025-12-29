const hre = require("hardhat");

async function main() {
  const SHIELD = "0x2A80E81612bd8C2d1169E305153B55240b6D2C27";
  const VESTING = "0xF005Ca0e391CB17FcA6740Ad5Ab80b03955A3301";

  const [deployer] = await hre.ethers.getSigners();
  console.log("Signer:", deployer.address);

  const shield = await hre.ethers.getContractAt("ShieldToken", SHIELD);
  const vesting = await hre.ethers.getContractAt("CapShieldVesting", VESTING);

  console.log("\n--- ShieldToken ---");
  console.log("name:", await shield.name());
  console.log("symbol:", await shield.symbol());
  console.log("decimals:", await shield.decimals());
  console.log("MAX_SUPPLY:", (await shield.MAX_SUPPLY()).toString());
  console.log("treasury:", await shield.treasury());
  console.log("paused:", await shield.paused());
  console.log("mintedEver:", (await shield.mintedEver()).toString());

  console.log("\n--- Vesting ---");
  console.log("token:", await vesting.token());
  console.log("paused:", await vesting.paused());
  console.log("totalAllocated:", (await vesting.totalAllocated()).toString());
  console.log("totalClaimed:", (await vesting.totalClaimed()).toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
