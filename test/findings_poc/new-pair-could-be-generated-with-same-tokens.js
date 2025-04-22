const { ethers } = require("hardhat");
const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("POC-New pair could be generated with same tokens", function () {
  // Helper function to get signers/accounts
  const getAccounts = async () => {
    const [deployer, creator, router, admin, user1, user2, attacker] =
      await ethers.getSigners();
    return { deployer, creator, router, admin, user1, user2, attacker };
  };

  // Basic fixture that deploys the core contracts
  async function deployBaseFixture() {
    const { deployer, creator, admin, router } = await getAccounts();

    const FERC20 = await ethers.getContractFactory("FERC20");
    const token0 = await FERC20.deploy("Token0", "T0", 1000, 100);
    const token1 = await FERC20.deploy("Token1", "T1", 1000, 100);

    const FFactory = await ethers.getContractFactory("FFactory");
    const factory = await upgrades.deployProxy(
      FFactory,
      [deployer.address, deployer.address, deployer.address],
      {
        initializer: "initialize",
        unsafeAllow: ["constructor", "delegatecall"],
      }
    );

    await factory.grantRole(await factory.CREATOR_ROLE(), creator.address);
    await factory.grantRole(await factory.ADMIN_ROLE(), admin.address);
    await factory.connect(admin).setRouter(router.address);

    return {
      factory,
      token0,
      token1,
    };
  }

  it("POC: New pair could be generated with same tokens", async function () {
    // Load the fixture
    const { factory, token0, token1 } = await loadFixture(deployBaseFixture);
    const { creator } = await getAccounts();

    await factory.connect(creator).createPair(token0.target, token1.target);

    console.log(
      "Pair address: ",
      await factory.getPair(token0.target, token1.target)
    );

    await factory.connect(creator).createPair(token0.target, token1.target);

    console.log(
      "Replaced Pair address: ",
      await factory.getPair(token0.target, token1.target)
    );
  });
});
