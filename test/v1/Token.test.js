const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CAPX and ANGEL Tokens (v1 baseline)", function () {
  let capx, angel;
  let owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const CAPX = await ethers.getContractFactory("CAPX");
    capx = await CAPX.deploy();

    const ANGEL = await ethers.getContractFactory("ANGEL");
    angel = await ANGEL.deploy();
  });

  // ─────────────────────────────────────────────
  // CAPX TOKEN TESTS (v1 baseline behavior)
  // ─────────────────────────────────────────────
  describe("CAPX Token - Fixed Supply", function () {
    it("Should have correct name, symbol, decimals, and fixed supply", async function () {
      expect(await capx.name()).to.equal("CAPShield Token");
      expect(await capx.symbol()).to.equal("CAPX");
      expect(await capx.decimals()).to.equal(18);

      const maxSupply = ethers.parseUnits("100000000", 18);
      expect(await capx.totalSupply()).to.equal(maxSupply);
      expect(await capx.getMaxSupply()).to.equal(maxSupply);
    });

    it("Should allow any user to burn their own tokens", async function () {
      const transferAmount = ethers.parseUnits("1000", 18);
      const burnAmount = ethers.parseUnits("500", 18);

      await capx.transfer(addr1.address, transferAmount);
      await capx.connect(addr1).burn(burnAmount);

      expect(await capx.balanceOf(addr1.address)).to.equal(
        transferAmount - burnAmount
      );
    });
  });

  // ─────────────────────────────────────────────
  // ANGEL TOKEN TESTS (v1 baseline behavior)
  // ─────────────────────────────────────────────
  describe("ANGEL Token - Mintable", function () {
    it("Should allow owner to mint tokens", async function () {
      const initialSupply = await angel.totalSupply();
      const mintAmount = ethers.parseUnits("5000000", 18);

      await angel.mint(addr1.address, mintAmount);

      expect(await angel.totalSupply()).to.equal(initialSupply + mintAmount);
      expect(await angel.balanceOf(addr1.address)).to.equal(mintAmount);
    });

    it("Should prevent non-owner from minting", async function () {
      const mintAmount = ethers.parseUnits("1000", 18);

      await expect(
        angel.connect(addr1).mint(addr1.address, mintAmount)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
