const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ShieldToken (v2)", function () {
  const NAME = "CapShield Token";
  const SYMBOL = "CAPY";
  const VERSION = "1";

  const MAX_SUPPLY = ethers.parseEther("100000000");

  async function deployFixture() {
    const [admin, treasury, dao, backendSigner, user, other] =
      await ethers.getSigners();

    const ShieldToken = await ethers.getContractFactory("ShieldToken");
    const token = await ShieldToken.deploy(
      admin.address,
      treasury.address,
      dao.address,
      backendSigner.address
    );

    return { token, admin, treasury, dao, backendSigner, user, other };
  }

  function domain(chainId, verifyingContract) {
    return {
      name: NAME,
      version: VERSION,
      chainId,
      verifyingContract,
    };
  }

  function types() {
    return {
      Mint: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
  }

  async function signUserMint(token, backendSigner, to, amount, nonce, deadline) {
    const network = await ethers.provider.getNetwork();
    const d = domain(network.chainId, token.target);
    const value = { to, amount, nonce, deadline };
    return backendSigner.signTypedData(d, types(), value);
  }

  async function expectPaused(txPromise) {
    try {
      await txPromise;
      expect.fail("Expected paused revert");
    } catch (e) {
      expect(String(e.message)).to.match(/Paused|Pausable: paused/);
    }
  }

  it("setting correct name, symbol, decimals, and max supply constant", async function () {
    const { token } = await deployFixture();

    expect(await token.name()).to.equal(NAME);
    expect(await token.symbol()).to.equal(SYMBOL);
    expect(await token.decimals()).to.equal(18);
    expect(await token.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
  });

  it("allowing adminMint and emitting OffchainMint", async function () {
    const { token, admin, user } = await deployFixture();

    const amount = ethers.parseEther("100");

    await expect(token.connect(admin).adminMint(user.address, amount, "saft"))
      .to.emit(token, "OffchainMint")
      .withArgs(user.address, amount, "saft");

    expect(await token.balanceOf(user.address)).to.equal(amount);
    expect(await token.mintedEver()).to.equal(amount);
  });

  it("blocking adminMint by non-admin", async function () {
    const { token, user, other } = await deployFixture();

    await expect(
      token.connect(user).adminMint(other.address, ethers.parseEther("1"), "x")
    ).to.be.reverted;
  });

  it("allowing userMint with backend signature and incrementing nonce", async function () {
    const { token, backendSigner, user } = await deployFixture();

    const amount = ethers.parseEther("25");
    const nonce = await token.nonces(user.address);
    const deadline =
      (await ethers.provider.getBlock("latest")).timestamp + 3600;

    const sig = await signUserMint(
      token,
      backendSigner,
      user.address,
      amount,
      nonce,
      deadline
    );

    await expect(token.connect(user).userMint(amount, deadline, sig))
      .to.emit(token, "UserMint")
      .withArgs(user.address, amount);

    expect(await token.balanceOf(user.address)).to.equal(amount);
    expect(await token.nonces(user.address)).to.equal(nonce + 1n);
  });

  it("blocking userMint with invalid signer", async function () {
    const { token, other, user } = await deployFixture();

    const amount = ethers.parseEther("10");
    const nonce = await token.nonces(user.address);
    const deadline =
      (await ethers.provider.getBlock("latest")).timestamp + 3600;

    const network = await ethers.provider.getNetwork();
    const sig = await other.signTypedData(
      domain(network.chainId, token.target),
      types(),
      { to: user.address, amount, nonce, deadline }
    );

    await expect(
      token.connect(user).userMint(amount, deadline, sig)
    ).to.be.revertedWith("Invalid signer");
  });

  it("blocking replay by nonce reuse", async function () {
    const { token, backendSigner, user } = await deployFixture();

    const amount = ethers.parseEther("5");
    const nonce = await token.nonces(user.address);
    const deadline =
      (await ethers.provider.getBlock("latest")).timestamp + 3600;

    const sig = await signUserMint(
      token,
      backendSigner,
      user.address,
      amount,
      nonce,
      deadline
    );

    await token.connect(user).userMint(amount, deadline, sig);

    await expect(
      token.connect(user).userMint(amount, deadline, sig)
    ).to.be.reverted;
  });

  it("enforcing hard cap and keeping it irreversible even after burns", async function () {
    const { token, admin, user } = await deployFixture();

    await token.connect(admin).adminMint(user.address, MAX_SUPPLY, "full");

    await expect(
      token.connect(admin).adminMint(
        user.address,
        ethers.parseEther("1"),
        "overflow"
      )
    ).to.be.revertedWith("Cap reached");

    await token.connect(user).burn(ethers.parseEther("100"));

    await expect(
      token.connect(admin).adminMint(
        user.address,
        ethers.parseEther("1"),
        "still overflow"
      )
    ).to.be.revertedWith("Cap reached");
  });

  it("applying 1% burn and 1% treasury allocation on normal transfers", async function () {
    const { token, admin, treasury, user, other } = await deployFixture();

    await token
      .connect(admin)
      .adminMint(user.address, ethers.parseEther("1000"), "fund");

    const send = ethers.parseEther("100");
    const treasuryBefore = await token.balanceOf(treasury.address);
    const totalBefore = await token.totalSupply();

    await token.connect(user).transfer(other.address, send);

    const burnAmount = send / 100n;
    const treasuryAmount = send / 100n;

    expect(await token.balanceOf(other.address)).to.equal(
      send - burnAmount - treasuryAmount
    );
    expect(await token.balanceOf(treasury.address)).to.equal(
      treasuryBefore + treasuryAmount
    );
    expect(await token.totalSupply()).to.equal(totalBefore - burnAmount);
  });

  it("skipping fees for treasury and dao transfers", async function () {
    const { token, admin, treasury, dao } = await deployFixture();

    await token
      .connect(admin)
      .adminMint(treasury.address, ethers.parseEther("100"), "treasury");

    const supplyBefore = await token.totalSupply();
    const daoBefore = await token.balanceOf(dao.address);

    await token
      .connect(treasury)
      .transfer(dao.address, ethers.parseEther("10"));

    expect(await token.balanceOf(dao.address)).to.equal(
      daoBefore + ethers.parseEther("10")
    );
    expect(await token.totalSupply()).to.equal(supplyBefore);
  });

  it("pausing and blocking mint and transfers", async function () {
    const { token, admin, user, other, backendSigner } =
      await deployFixture();

    await token.connect(admin).pause();

    await expectPaused(
      token.connect(admin).adminMint(
        user.address,
        ethers.parseEther("1"),
        "x"
      )
    );

    const nonce = await token.nonces(user.address);
    const deadline =
      (await ethers.provider.getBlock("latest")).timestamp + 3600;

    const sig = await signUserMint(
      token,
      backendSigner,
      user.address,
      ethers.parseEther("1"),
      nonce,
      deadline
    );

    await expectPaused(
      token.connect(user).userMint(
        ethers.parseEther("1"),
        deadline,
        sig
      )
    );

    await expectPaused(
      token.connect(user).transfer(other.address, ethers.parseEther("1"))
    );

    await token.connect(admin).unpause();

    await token
      .connect(admin)
      .adminMint(user.address, ethers.parseEther("2"), "y");

    await token
      .connect(user)
      .transfer(other.address, ethers.parseEther("1"));
  });

  it("minting revenue-based amount and emitting RevenueMint", async function () {
    const { token, admin, treasury } = await deployFixture();

    const revenue = 1000000n;
    const marketValue = 100n;
    const expected = revenue / marketValue;

    await expect(token.connect(admin).revenueMint(revenue, marketValue))
      .to.emit(token, "RevenueMint")
      .withArgs(revenue, marketValue, expected);

    expect(await token.balanceOf(treasury.address)).to.equal(expected);
  });
});
