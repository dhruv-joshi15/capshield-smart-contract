const hre = require("hardhat");

async function main() {
  const VESTING = "0xF005Ca0e391CB17FcA6740Ad5Ab80b03955A3301";

  const [deployer] = await hre.ethers.getSigners();
  const vesting = await hre.ethers.getContractAt("CapShieldVesting", VESTING);

  const beneficiary = deployer.address;
  const allocation = hre.ethers.parseEther("100"); // 100 CAPY vesting

  console.log("Creating vesting for:", beneficiary);
  const tx = await vesting.createVesting(beneficiary, allocation);
  await tx.wait();

  const v = await vesting.vestings(beneficiary);
  console.log("Vesting created:");
  console.log("totalAllocation:", v.totalAllocation.toString());
  console.log("claimed:", v.claimed.toString());
  console.log("startTime:", v.startTime.toString());
  console.log("revoked:", v.revoked);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
