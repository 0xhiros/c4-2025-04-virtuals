const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { MaxUint256, parseEther, parseUnits } = require("ethers");

describe("POC-Double reentrancy guards make launch function to revert", function () {
  // Helper function to get signers/accounts
  const getAccounts = async () => {
    const [deployer, admin, user, treasury, mockAgentFactory] =
      await ethers.getSigners();
    return {
      deployer,
      admin,
      user,
      treasury,
      mockAgentFactory,
    };
  };

  // Basic fixture that deploys the core contracts
  async function deployBaseFixture() {
    const { deployer, user, admin, treasury, mockAgentFactory } =
      await getAccounts();

    const FERC20 = await ethers.getContractFactory("FERC20");
    const assetToken = await FERC20.connect(user).deploy(
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

    const bonding = await upgrades.deployProxy(
      await ethers.getContractFactory("Bonding"),
      [
        factory.target,
        router.target,
        treasury.address,
        100000, //100
        "1000000000",
        10000,
        100,
        mockAgentFactory.address,
        parseEther("85000000"),
      ]
    );

    await factory.grantRole(await factory.CREATOR_ROLE(), bonding.target);
    await factory.grantRole(await factory.ADMIN_ROLE(), admin.address);
    await router.grantRole(await router.EXECUTOR_ROLE(), bonding.target);
    await factory.connect(admin).setRouter(router.target);
    await factory.connect(admin).setTaxParams(treasury.address, 1, 1);

    await assetToken.connect(user).approve(bonding.target, MaxUint256);

    return {
      factory,
      router,
      assetToken,
      bonding,
    };
  }

  it("POC: Double reentrancy guards make launch function to revert", async function () {
    // Load the fixture
    const { bonding } = await loadFixture(deployBaseFixture);
    const { user } = await getAccounts();

    const purchaseAmount = parseUnits("1000");

    console.log("!!!LaunchFor function works");
    await bonding
      .connect(user)
      .launchFor(
        "Test",
        "TEST",
        [0, 1, 2],
        "TEST",
        "https://test.com",
        ["", "", "", ""],
        purchaseAmount,
        user.address
      );

    console.log("!!! But, Launch function reverts");
    await bonding
      .connect(user)
      .launch(
        "Test",
        "TEST",
        [0, 1, 2],
        "TEST",
        "https://test.com",
        ["", "", "", ""],
        purchaseAmount
      );
  });
});
