const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CapShieldVesting (v2)", function () {
  const CLIFF = 36 * 30 * 24 * 60 * 60;
  const VEST = 50 * 30 * 24 * 60 * 60;

  async function deployFixture() {
    const [admin, treasury, dao, backendSigner, beneficiary, other] = await ethers.getSigners();

    const ShieldToken = await ethers.getContractFactory("ShieldToken");
    const token = await ShieldToken.deploy(
      admin.address,
      treasury.address,
      dao.address,
      backendSigner.address
    );

    const Vesting = await ethers.getContractFactory("CapShieldVesting");
    const vesting = await Vesting.deploy(token.target, admin.address);

    return { token, vesting, admin, treasury, dao, backendSigner, beneficiary, other };
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

  it("creating vesting only after funding contract", async function () {
    const { token, vesting, admin, backendSigner, beneficiary } = await deployFixture();

    const allocation = ethers.parseEther("1000");

    await expect(
      vesting.connect(admin).createVesting(beneficiary.address, allocation)
    ).to.be.revertedWith("Insufficient funding");

    const nonce = await token.nonces(admin.address);
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    const sig = await signUserMint(token, backendSigner, admin.address, allocation, nonce, deadline);

    await token.connect(admin).userMint(allocation, deadline, sig);
    await token.connect(admin).transfer(vesting.target, allocation);

    await vesting.connect(admin).createVesting(beneficiary.address, allocation);
  });

  it("blocking claim before cliff", async function () {
    const { token, vesting, admin, backendSigner, beneficiary } = await deployFixture();

    const allocation = ethers.parseEther("1000");
    const nonce = await token.nonces(admin.address);
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    const sig = await signUserMint(token, backendSigner, admin.address, allocation, nonce, deadline);

    await token.connect(admin).userMint(allocation, deadline, sig);
    await token.connect(admin).transfer(vesting.target, allocation);
    await vesting.connect(admin).createVesting(beneficiary.address, allocation);

    await expect(vesting.connect(beneficiary).claim()).to.be.revertedWith("Nothing to claim");
  });

  it("allowing partial claim mid vesting with fee applied", async function () {
    const { token, vesting, admin, backendSigner, beneficiary } = await deployFixture();

    const allocation = ethers.parseEther("1000");
    const nonce = await token.nonces(admin.address);
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    const sig = await signUserMint(token, backendSigner, admin.address, allocation, nonce, deadline);

    await token.connect(admin).userMint(allocation, deadline, sig);
    await token.connect(admin).transfer(vesting.target, allocation);
    await vesting.connect(admin).createVesting(beneficiary.address, allocation);

    const v = await vesting.vestings(beneficiary.address);
    const cliffEnd = Number(v.startTime) + CLIFF;

    await time.increaseTo(cliffEnd + Math.floor(VEST / 2));

    const claimable = await vesting.claimableAmount(beneficiary.address);
    const expectedAfterFee = (claimable * 98n) / 100n;

    await vesting.connect(beneficiary).claim();

    const balance = await token.balanceOf(beneficiary.address);
    const diff =
      balance > expectedAfterFee
        ? balance - expectedAfterFee
        : expectedAfterFee - balance;

    expect(diff).to.be.lessThan(ethers.parseEther("0.00001"));
  });

  it("allowing full claim after vesting ends with fee applied", async function () {
    const { token, vesting, admin, backendSigner, beneficiary } = await deployFixture();

    const allocation = ethers.parseEther("1000");
    const nonce = await token.nonces(admin.address);
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    const sig = await signUserMint(token, backendSigner, admin.address, allocation, nonce, deadline);

    await token.connect(admin).userMint(allocation, deadline, sig);
    await token.connect(admin).transfer(vesting.target, allocation);
    await vesting.connect(admin).createVesting(beneficiary.address, allocation);

    const v = await vesting.vestings(beneficiary.address);
    await time.increaseTo(Number(v.startTime) + CLIFF + VEST + 10);

    await vesting.connect(beneficiary).claim();

    const expected = (allocation * 98n) / 100n;
    expect(await token.balanceOf(beneficiary.address)).to.equal(expected);
  });

  it("revoking and blocking further claims", async function () {
    const { token, vesting, admin, backendSigner, beneficiary } = await deployFixture();

    const allocation = ethers.parseEther("1000");
    const nonce = await token.nonces(admin.address);
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    const sig = await signUserMint(token, backendSigner, admin.address, allocation, nonce, deadline);

    await token.connect(admin).userMint(allocation, deadline, sig);
    await token.connect(admin).transfer(vesting.target, allocation);
    await vesting.connect(admin).createVesting(beneficiary.address, allocation);

    const v = await vesting.vestings(beneficiary.address);
    await time.increaseTo(Number(v.startTime) + CLIFF + Math.floor(VEST / 2));

    await vesting.connect(admin).revoke(beneficiary.address);

    await expect(vesting.connect(beneficiary).claim()).to.be.revertedWith("Vesting revoked");
  });
});
