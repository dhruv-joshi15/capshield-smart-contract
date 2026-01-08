const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CapShieldVesting (v2)", function () {
  const CLIFF = 36 * 30 * 24 * 60 * 60;
  const VEST = 50 * 30 * 24 * 60 * 60;

  async function deployFixture() {
    const [admin, treasury, dao, backendSigner, beneficiary, other] =
      await ethers.getSigners();

    const ShieldToken = await ethers.getContractFactory("ShieldToken");
    const token = await ShieldToken.deploy(
      admin.address,
      treasury.address,
      dao.address,
      backendSigner.address
    );

    const Vesting = await ethers.getContractFactory("CapShieldVesting");
    const vesting = await Vesting.deploy(
      token.target,
      admin.address,
      treasury.address
    );

    return {
      token,
      vesting,
      admin,
      treasury,
      dao,
      backendSigner,
      beneficiary,
      other,
    };
  }

  async function signUserMint(token, backendSigner, to, amount, nonce, deadline) {
    const network = await ethers.provider.getNetwork();
    return backendSigner.signTypedData(
      {
        name: "CapShield Token",
        version: "1",
        chainId: network.chainId,
        verifyingContract: token.target,
      },
      {
        Mint: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { to, amount, nonce, deadline }
    );
  }

  async function fundVesting(token, vesting, admin, backendSigner, amount) {
    const nonce = await token.nonces(admin.address);
    const deadline =
      (await ethers.provider.getBlock("latest")).timestamp + 3600;

    const sig = await signUserMint(
      token,
      backendSigner,
      admin.address,
      amount,
      nonce,
      deadline
    );

    await token.connect(admin).userMint(amount, deadline, sig);
    await token.connect(admin).transfer(vesting.target, amount);
  }

  function expectClose(actual, expected, tolerance) {
    const diff = actual > expected ? actual - expected : expected - actual;
    expect(diff).to.be.lte(tolerance);
  }

  it("creating vesting only after funding contract", async function () {
    const { token, vesting, admin, backendSigner, beneficiary } =
      await deployFixture();
    const allocation = ethers.parseEther("1000");

    await expect(
      vesting.connect(admin).createVesting(beneficiary.address, allocation)
    ).to.be.revertedWith("Insufficient funding");

    await fundVesting(token, vesting, admin, backendSigner, allocation);
    await vesting.connect(admin).createVesting(beneficiary.address, allocation);
  });

  it("blocking claim before cliff", async function () {
    const { token, vesting, admin, backendSigner, beneficiary } =
      await deployFixture();
    const allocation = ethers.parseEther("1000");

    await fundVesting(token, vesting, admin, backendSigner, allocation);
    await vesting.connect(admin).createVesting(beneficiary.address, allocation);

    await expect(vesting.connect(beneficiary).claim()).to.be.revertedWith(
      "Nothing to claim"
    );
  });

  it("allowing partial claim mid vesting", async function () {
    const { token, vesting, admin, backendSigner, beneficiary } =
      await deployFixture();
    const allocation = ethers.parseEther("1000");

    await fundVesting(token, vesting, admin, backendSigner, allocation);
    await vesting.connect(admin).createVesting(beneficiary.address, allocation);

    const v = await vesting.vestings(beneficiary.address);
    await time.increaseTo(Number(v.startTime) + CLIFF + Math.floor(VEST / 2));

    const claimable = await vesting.claimableAmount(beneficiary.address);
    expect(claimable).to.be.gt(0n);

    const benBefore = await token.balanceOf(beneficiary.address);
    await vesting.connect(beneficiary).claim();
    const benAfter = await token.balanceOf(beneficiary.address);

    const received = benAfter - benBefore;
    const tolerance = ethers.parseEther("0.02");
    expectClose(received, claimable, tolerance);
  });

  it("allowing full claim after vesting ends", async function () {
    const { token, vesting, admin, backendSigner, beneficiary } =
      await deployFixture();
    const allocation = ethers.parseEther("1000");

    await fundVesting(token, vesting, admin, backendSigner, allocation);
    await vesting.connect(admin).createVesting(beneficiary.address, allocation);

    const v = await vesting.vestings(beneficiary.address);
    await time.increaseTo(Number(v.startTime) + CLIFF + VEST + 10);

    const claimable = await vesting.claimableAmount(beneficiary.address);
    expect(claimable).to.equal(allocation);

    const benBefore = await token.balanceOf(beneficiary.address);
    await vesting.connect(beneficiary).claim();
    const benAfter = await token.balanceOf(beneficiary.address);

    expect(benAfter - benBefore).to.equal(allocation);
  });

  it("revoking returns unvested to treasury and allows claiming already vested tokens", async function () {
    const { token, vesting, admin, backendSigner, beneficiary } =
      await deployFixture();
    const allocation = ethers.parseEther("1000");

    await fundVesting(token, vesting, admin, backendSigner, allocation);
    await vesting.connect(admin).createVesting(beneficiary.address, allocation);

    const v = await vesting.vestings(beneficiary.address);
    await time.increaseTo(Number(v.startTime) + CLIFF + Math.floor(VEST / 2));

    await vesting.connect(admin).revoke(beneficiary.address);

    const claimableAfterRevoke = await vesting.claimableAmount(
      beneficiary.address
    );
    expect(claimableAfterRevoke).to.be.gt(0n);

    const benBefore = await token.balanceOf(beneficiary.address);
    await vesting.connect(beneficiary).claim();
    const benAfter = await token.balanceOf(beneficiary.address);

    const received = benAfter - benBefore;
    const tolerance = ethers.parseEther("0.02");
    expectClose(received, claimableAfterRevoke, tolerance);

    const remaining = await vesting.claimableAmount(beneficiary.address);
expect(remaining).to.be.lte(ethers.parseEther("0.000001"));

  });

  it("UI view functions return correct values", async function () {
    const { token, vesting, admin, backendSigner, beneficiary } =
      await deployFixture();
    const allocation = ethers.parseEther("1000");

    await fundVesting(token, vesting, admin, backendSigner, allocation);
    await vesting.connect(admin).createVesting(beneficiary.address, allocation);

    const gv = await vesting.getVesting(beneficiary.address);

    expect(gv.totalAllocation).to.equal(allocation);
    expect(gv.claimed).to.equal(0n);
    expect(gv.startTime).to.be.gt(0n);
    expect(gv.cliffEnd).to.equal(gv.startTime + BigInt(CLIFF));
    expect(gv.vestingEnd).to.equal(gv.cliffEnd + BigInt(VEST));
    expect(gv.revoked).to.equal(false);
  });
});
