const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ZeroAddress, parseEther } = require("ethers");
const { mine } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const getMintServiceCalldata = async (serviceNft, virtualId, hash) => {
  return serviceNft.interface.encodeFunctionData("mint", [virtualId, hash]);
};

function getDescHash(str) {
  return ethers.keccak256(ethers.toUtf8Bytes(str));
}

describe("POC-Wrong implementation to load contribution nft data at ServiceNft.mint", function () {
  const genesisInput = {
    name: "Jessica",
    symbol: "JSC",
    tokenURI: "http://jessica",
    daoName: "Jessica DAO",
    cores: [0, 1, 2],
    tbaSalt:
      "0xa7647ac9429fdce477ebd9a95510385b756c757c26149e740abbab0ad1be2f16",
    tbaImplementation: process.env.TBA_IMPLEMENTATION,
    daoVotingPeriod: 600,
    daoThreshold: 1000000000000000000000n,
  };

  const getAccounts = async () => {
    const [deployer, minter, founder, tba] = await ethers.getSigners();
    return {
      deployer,
      minter,
      founder,
      tba,
    };
  };

  async function deployBaseContracts() {
    const { deployer, minter, founder } = await getAccounts();

    const veVirtualToken = await ethers.getContractFactory("veVirtualToken");

    // It's fine to use any ERC20Votes as agent token for voting
    const token = await veVirtualToken.deploy(deployer.address);

    const AgentNft = await ethers.getContractFactory("AgentNftV2");
    const agentNft = await upgrades.deployProxy(AgentNft, [deployer.address]);

    const AgentDAO = await ethers.getContractFactory("AgentDAO");
    const agentDAO = await upgrades.deployProxy(
      AgentDAO,
      [
        genesisInput.daoName,
        token.target,
        agentNft.target,
        genesisInput.daoThreshold,
        genesisInput.daoVotingPeriod,
      ],
      {
        initializer: "initialize",
        unsafeAllow: ["constructor", "delegatecall"],
        // kind: "transparent",
        // initialOwner: owner.address,
      }
    );

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

    await token.oracleTransfer(
      [ZeroAddress],
      [founder.address],
      [parseEther("100000")]
    );

    await token.connect(founder).delegate(founder.address);

    return {
      agentNft,
      agentDAO,
      token,
      serviceNft: service,
      contributionNft: contribution,
    };
  }

  it("POC: Wrong implementation to load contribution nft data at ServiceNft.mint", async function () {
    const { minter, founder, tba } = await getAccounts();
    const { agentNft, agentDAO, serviceNft } = await deployBaseContracts();

    // Mint Agent Nft and set TBA
    const VIRTUAL_ID = await agentNft.nextVirtualId();

    await agentNft
      .connect(minter)
      .mint(
        VIRTUAL_ID,
        minter.address,
        "",
        agentDAO.target,
        founder.address,
        genesisInput.cores,
        ZeroAddress,
        ZeroAddress
      );

    await agentNft.connect(minter).setTBA(VIRTUAL_ID, tba.address);

    // Create ServiceNft.mint proposal
    const desc = "test";
    const descHash = getDescHash(desc);

    const mintCalldata = await getMintServiceCalldata(
      serviceNft,
      VIRTUAL_ID,
      descHash
    );

    await agentDAO.propose([serviceNft.target], [0], [mintCalldata], desc);

    const filter = agentDAO.filters.ProposalCreated;
    const events = await agentDAO.queryFilter(filter, -1);
    const event = events[0];
    const proposalId = event.args[0];

    await mine(10);

    await agentDAO
      .connect(founder)
      .castVoteWithReasonAndParams(proposalId, 1, "lfg", "0x");

    const state = await agentDAO.state(proposalId);
    expect(state).to.equal(7n);

    expect(await serviceNft.ownerOf(proposalId)).to.equal(tba.address);

    console.log("---The core is always zero, and cannot be set forever---");
    expect(await serviceNft.connect(tba).getCore(proposalId)).to.be.eq(0);
  });
});
