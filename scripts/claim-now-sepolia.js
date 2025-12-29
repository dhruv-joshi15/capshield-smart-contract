const hre = require("hardhat");

async function main() {
  const VESTING = "0xF005Ca0e391CB17FcA6740Ad5Ab80b03955A3301";

  const [deployer] = await hre.ethers.getSigners();
  const vesting = await hre.ethers.getContractAt("CapShieldVesting", VESTING);

  console.log("Claimable now:", (await vesting.claimableAmount(deployer.address)).toString());

  console.log("Trying claim...");
  const tx = await vesting.claim(); // should revert because cliff not reached
  await tx.wait();

  console.log("Claim success (unexpected).");
}

main().catch((e) => {
  console.log("Claim reverted as expected:");
  console.log(String(e.message));
  process.exit(0);
});
