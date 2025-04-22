const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { parseEther } = require("ethers/utils");

describe("POC-veVIRTUAL token approval is still possible", function () {
  const NAME = "Virtual Protocol Voting";
  const VERSION = "1";

  // Helper function to get signers/accounts
  const getAccounts = async () => {
    const [deployer, admin, user1, user2, attacker] = await ethers.getSigners();
    return { deployer, admin, user1, user2, attacker };
  };

  // Basic fixture that deploys the core contracts
  async function deployBaseFixture() {
    const { deployer } = await getAccounts();

    const veVirtualToken = await ethers.getContractFactory("veVirtualToken");
    const veToken = await veVirtualToken.deploy(deployer.address);

    return {
      veToken,
    };
  }

  it("POC: veVIRTUAL token approval is still possible", async function () {
    // Load the fixture
    const { veToken } = await loadFixture(deployBaseFixture);
    const { attacker, deployer } = await getAccounts();

    const domain = {
      name: NAME,
      version: VERSION,
      chainId: 31337,
      verifyingContract: veToken.target,
    };

    const types = {
      Permit: [
        {
          name: "owner",
          type: "address",
        },
        {
          name: "spender",
          type: "address",
        },
        {
          name: "value",
          type: "uint256",
        },
        {
          name: "nonce",
          type: "uint256",
        },
        {
          name: "deadline",
          type: "uint256",
        },
      ],
    };

    const value = parseEther("1");
    const deadline = (await time.latest()) + 1000;
    const values = {
      owner: attacker.address,
      spender: deployer.address,
      value,
      nonce: 0,
      deadline,
    };

    const signature = await attacker.signTypedData(domain, types, values);
    const sig = ethers.Signature.from(signature);

    const tx = await veToken.permit(
      attacker.address,
      deployer.address,
      value,
      deadline,
      sig.v,
      sig.r,
      sig.s
    );

    const allowance = await veToken.allowance(
      attacker.address,
      deployer.address
    );
    console.log("Allowance:", allowance);

    expect(allowance).to.be.equal(0n);
  });
});
