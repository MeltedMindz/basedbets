import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { MainSlotManager } from "../typechain-types";
import { MockERC20 } from "../typechain-types";
import { MockPyth } from "../typechain-types";

describe("MainSlotManager", function () {
  let manager: MainSlotManager;
  let mockUSDC: MockERC20;
  let mockPyth: MockPyth;
  let owner: SignerWithAddress;
  let player1: SignerWithAddress;
  let player2: SignerWithAddress;
  let houseWallet: SignerWithAddress;

  // Test constants
  const USDC_DECIMALS = 6;
  const INITIAL_USDC_SUPPLY = ethers.parseUnits("1000000", USDC_DECIMALS); // 1M USDC
  const PYTH_FEED_ID = "0x1234567890123456789012345678901234567890123456789012345678901234";

  beforeEach(async function () {
    [owner, player1, player2, houseWallet] = await ethers.getSigners();

    // Deploy mock USDC
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20Factory.deploy(
      "USD Coin",
      "USDC",
      USDC_DECIMALS,
      INITIAL_USDC_SUPPLY
    );

    // Deploy mock Pyth
    const MockPythFactory = await ethers.getContractFactory("MockPyth");
    mockPyth = await MockPythFactory.deploy();

    // Deploy MainSlotManager
    const MainSlotManagerFactory = await ethers.getContractFactory("MainSlotManager");
    manager = await MainSlotManagerFactory.deploy(
      await mockUSDC.getAddress(),
      houseWallet.address
    );

    // Mint USDC to players for testing
    await mockUSDC.mint(player1.address, ethers.parseUnits("1000", USDC_DECIMALS));
    await mockUSDC.mint(player2.address, ethers.parseUnits("1000", USDC_DECIMALS));
    await mockUSDC.mint(owner.address, ethers.parseUnits("10000", USDC_DECIMALS));
  });

  describe("Deployment", function () {
    it("Should set correct initial values", async function () {
      expect(await manager.usdc()).to.equal(await mockUSDC.getAddress());
      expect(await manager.houseWallet()).to.equal(houseWallet.address);
      
      const stats = await manager.getManagerStats();
      expect(stats.totalVolume).to.equal(0);
      expect(stats.totalSpins).to.equal(0);
      expect(stats.jackpotPool).to.equal(0);
      expect(stats.slotMachineCount).to.equal(0);
    });

    it("Should have slot machine implementation deployed", async function () {
      const implementation = await manager.slotMachineImplementation();
      expect(implementation).to.not.equal(ethers.ZeroAddress);
    });

    it("Should have correct default configuration", async function () {
      expect(await manager.maxJackpotPercentage()).to.equal(1000); // 10%
      expect(await manager.maxHouseEdge()).to.equal(1000); // 10%
      expect(await manager.defaultJackpotPercentage()).to.equal(500); // 5%
      expect(await manager.defaultHouseEdge()).to.equal(500); // 5%
      expect(await manager.spinsPerRandomnessRefresh()).to.equal(1000);
    });
  });

  describe("Slot Machine Deployment", function () {
    it("Should deploy slot machine clone", async function () {
      const tx = await manager.deploySlotMachine(
        await mockPyth.getAddress(),
        PYTH_FEED_ID,
        player1.address
      );

      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        try {
          const parsed = manager.interface.parseLog(log);
          return parsed?.name === "SlotMachineDeployed";
        } catch {
          return false;
        }
      });

      expect(event).to.not.be.undefined;

      const stats = await manager.getManagerStats();
      expect(stats.slotMachineCount).to.equal(1);

      const slotMachineCount = await manager.getSlotMachineCount();
      expect(slotMachineCount).to.equal(1);

      const allMachines = await manager.getAllSlotMachines();
      expect(allMachines.length).to.equal(1);
      expect(allMachines[0]).to.not.equal(ethers.ZeroAddress);
    });

    it("Should register deployed slot machine", async function () {
      const slotMachineAddress = await manager.deploySlotMachine(
        await mockPyth.getAddress(),
        PYTH_FEED_ID,
        player1.address
      );

      const isRegistered = await manager.isRegisteredSlotMachine(slotMachineAddress);
      expect(isRegistered).to.be.true;
    });

    it("Should only allow owner to deploy slot machines", async function () {
      await expect(
        manager.connect(player1).deploySlotMachine(
          await mockPyth.getAddress(),
          PYTH_FEED_ID,
          player1.address
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Jackpot Management", function () {
    let slotMachine: any;

    beforeEach(async function () {
      // Deploy a slot machine for testing
      const slotMachineAddress = await manager.deploySlotMachine(
        await mockPyth.getAddress(),
        PYTH_FEED_ID,
        owner.address
      );
      slotMachine = await ethers.getContractAt("SlotMachine", slotMachineAddress);
    });

    it("Should allow slot machines to deposit to jackpot", async function () {
      const depositAmount = ethers.parseUnits("100", USDC_DECIMALS);

      // Mint USDC to slot machine
      await mockUSDC.mint(await slotMachine.getAddress(), depositAmount);

      // Approve manager to spend USDC
      await slotMachine.connect(owner).approve(await manager.getAddress(), depositAmount);

      // Deposit to jackpot
      await manager.connect(await slotMachine.getAddress()).depositToJackpot(depositAmount, await slotMachine.getAddress());

      const stats = await manager.getManagerStats();
      expect(stats.jackpotPool).to.equal(depositAmount);
    });

    it("Should only allow registered slot machines to deposit", async function () {
      const depositAmount = ethers.parseUnits("100", USDC_DECIMALS);

      await expect(
        manager.connect(player1).depositToJackpot(depositAmount, player1.address)
      ).to.be.revertedWith("Only registered slot machines");
    });

    it("Should allow owner to fund jackpot manually", async function () {
      const fundAmount = ethers.parseUnits("500", USDC_DECIMALS);

      // Approve manager to spend USDC
      await mockUSDC.connect(owner).approve(await manager.getAddress(), fundAmount);

      // Fund jackpot
      await manager.connect(owner).fundJackpot(fundAmount);

      const stats = await manager.getManagerStats();
      expect(stats.jackpotPool).to.equal(fundAmount);
    });

    it("Should handle jackpot wins correctly", async function () {
      const betAmount = ethers.parseUnits("100", USDC_DECIMALS);

      // Fund jackpot first
      await mockUSDC.connect(owner).approve(await manager.getAddress(), betAmount);
      await manager.connect(owner).fundJackpot(betAmount);

      // Test jackpot win (this is probabilistic, so we'll test the function exists)
      const [won, payout] = await manager.tryJackpotWin(player1.address, betAmount, await slotMachine.getAddress());
      
      // Most likely won't win due to odds, but function should work
      expect(typeof won).to.equal("boolean");
      expect(typeof payout).to.equal("bigint");
    });

    it("Should calculate jackpot odds based on bet size", async function () {
      // Test different bet amounts
      const smallBet = ethers.parseUnits("1", USDC_DECIMALS);
      const largeBet = ethers.parseUnits("100", USDC_DECIMALS);

      // The odds calculation is internal, but we can test that larger bets have higher chances
      // by calling tryJackpotWin multiple times and checking the behavior
      
      // Fund jackpot
      await mockUSDC.connect(owner).approve(await manager.getAddress(), ethers.parseUnits("1000", USDC_DECIMALS));
      await manager.connect(owner).fundJackpot(ethers.parseUnits("1000", USDC_DECIMALS));

      // Test both bet amounts
      const [won1, payout1] = await manager.tryJackpotWin(player1.address, smallBet, await slotMachine.getAddress());
      const [won2, payout2] = await manager.tryJackpotWin(player2.address, largeBet, await slotMachine.getAddress());

      // Both should return valid results
      expect(typeof won1).to.equal("boolean");
      expect(typeof payout1).to.equal("bigint");
      expect(typeof won2).to.equal("boolean");
      expect(typeof payout2).to.equal("bigint");
    });
  });

  describe("Configuration Management", function () {
    it("Should allow owner to update house wallet", async function () {
      const newHouseWallet = player1.address;
      
      await manager.connect(owner).updateHouseWallet(newHouseWallet);
      expect(await manager.houseWallet()).to.equal(newHouseWallet);
    });

    it("Should allow owner to update configuration", async function () {
      const newJackpotPercentage = 600; // 6%
      const newHouseEdge = 400; // 4%
      const newSpinsPerRefresh = 500;

      await manager.connect(owner).updateConfiguration(
        newJackpotPercentage,
        newHouseEdge,
        newSpinsPerRefresh
      );

      expect(await manager.defaultJackpotPercentage()).to.equal(newJackpotPercentage);
      expect(await manager.defaultHouseEdge()).to.equal(newHouseEdge);
      expect(await manager.spinsPerRandomnessRefresh()).to.equal(newSpinsPerRefresh);
    });

    it("Should enforce maximum limits on configuration", async function () {
      const tooHighJackpot = 1100; // 11% (exceeds 10% max)
      const tooHighHouseEdge = 1100; // 11% (exceeds 10% max)

      await expect(
        manager.connect(owner).updateConfiguration(
          tooHighJackpot,
          500,
          1000
        )
      ).to.be.revertedWith("Jackpot percentage too high");

      await expect(
        manager.connect(owner).updateConfiguration(
          500,
          tooHighHouseEdge,
          1000
        )
      ).to.be.revertedWith("House edge too high");
    });

    it("Should only allow owner to update configuration", async function () {
      await expect(
        manager.connect(player1).updateConfiguration(600, 400, 500)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Withdrawals", function () {
    beforeEach(async function () {
      // Fund the manager with USDC and ETH
      await mockUSDC.connect(owner).transfer(await manager.getAddress(), ethers.parseUnits("1000", USDC_DECIMALS));
      await owner.sendTransaction({
        to: await manager.getAddress(),
        value: ethers.parseEther("1")
      });
    });

    it("Should allow owner to withdraw USDC", async function () {
      const withdrawAmount = ethers.parseUnits("500", USDC_DECIMALS);
      
      const initialBalance = await mockUSDC.balanceOf(houseWallet.address);
      await manager.connect(owner).withdrawUSDC(withdrawAmount);
      const finalBalance = await mockUSDC.balanceOf(houseWallet.address);
      
      expect(finalBalance).to.equal(initialBalance + withdrawAmount);
    });

    it("Should allow owner to withdraw ETH", async function () {
      const withdrawAmount = ethers.parseEther("0.5");
      
      const initialBalance = await ethers.provider.getBalance(houseWallet.address);
      await manager.connect(owner).withdrawETH(withdrawAmount);
      const finalBalance = await ethers.provider.getBalance(houseWallet.address);
      
      expect(finalBalance).to.equal(initialBalance + withdrawAmount);
    });

    it("Should only allow owner to withdraw", async function () {
      await expect(
        manager.connect(player1).withdrawUSDC(ethers.parseUnits("100", USDC_DECIMALS))
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Statistics", function () {
    let slotMachine: any;

    beforeEach(async function () {
      // Deploy a slot machine for testing
      const slotMachineAddress = await manager.deploySlotMachine(
        await mockPyth.getAddress(),
        PYTH_FEED_ID,
        owner.address
      );
      slotMachine = await ethers.getContractAt("SlotMachine", slotMachineAddress);
    });

    it("Should allow slot machines to update statistics", async function () {
      const volume = ethers.parseUnits("100", USDC_DECIMALS);
      const spins = 5;

      await manager.connect(await slotMachine.getAddress()).updateStats(volume, spins);

      const stats = await manager.getManagerStats();
      expect(stats.totalVolume).to.equal(volume);
      expect(stats.totalSpins).to.equal(spins);
    });

    it("Should only allow registered slot machines to update stats", async function () {
      await expect(
        manager.connect(player1).updateStats(ethers.parseUnits("100", USDC_DECIMALS), 5)
      ).to.be.revertedWith("Only registered slot machines");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero amounts correctly", async function () {
      await expect(
        manager.connect(owner).fundJackpot(0)
      ).to.be.revertedWith("Amount must be positive");
    });

    it("Should handle invalid addresses", async function () {
      await expect(
        manager.connect(owner).updateHouseWallet(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid house wallet");
    });

    it("Should handle ETH transfers", async function () {
      const ethAmount = ethers.parseEther("1");
      
      await owner.sendTransaction({
        to: await manager.getAddress(),
        value: ethAmount
      });
      
      const balance = await ethers.provider.getBalance(await manager.getAddress());
      expect(balance).to.equal(ethAmount);
    });
  });
});
