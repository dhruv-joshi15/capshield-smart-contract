const hre = require("hardhat");

async function main() {
  const SHIELD = "0x2A80E81612bd8C2d1169E305153B55240b6D2C27";
  const VESTING = "0xF005Ca0e391CB17FcA6740Ad5Ab80b03955A3301";

  const [deployer] = await hre.ethers.getSigners();
  const shield = await hre.ethers.getContractAt("ShieldToken", SHIELD);

  const amount = hre.ethers.parseEther("1000"); // fund with 1000 CAPY

  console.log("Minting to vesting:", VESTING);
  const tx = await shield.adminMint(VESTING, amount, "fund vesting");
  await tx.wait();

  console.log("Done. Vesting balance:", (await shield.balanceOf(VESTING)).toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
