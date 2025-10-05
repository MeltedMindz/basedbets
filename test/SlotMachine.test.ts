import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { MainSlotManager } from "../typechain-types";
import { MockERC20 } from "../typechain-types";
import { MockPyth } from "../typechain-types";

describe("SlotMachine", function () {
  let manager: MainSlotManager;
  let slotMachine: any;
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
  const BET_AMOUNTS = [
    ethers.parseUnits("1", USDC_DECIMALS),    // 1 USDC
    ethers.parseUnits("5", USDC_DECIMALS),    // 5 USDC
    ethers.parseUnits("10", USDC_DECIMALS),   // 10 USDC
    ethers.parseUnits("25", USDC_DECIMALS),   // 25 USDC
    ethers.parseUnits("50", USDC_DECIMALS),   // 50 USDC
    ethers.parseUnits("100", USDC_DECIMALS),  // 100 USDC
  ];

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

    // Deploy slot machine clone
    const slotMachineAddress = await manager.deploySlotMachine(
      await mockPyth.getAddress(),
      PYTH_FEED_ID,
      owner.address
    );
    slotMachine = await ethers.getContractAt("SlotMachine", slotMachineAddress);

    // Mint USDC to players for testing
    await mockUSDC.mint(player1.address, ethers.parseUnits("1000", USDC_DECIMALS));
    await mockUSDC.mint(player2.address, ethers.parseUnits("1000", USDC_DECIMALS));
    await mockUSDC.mint(owner.address, ethers.parseUnits("10000", USDC_DECIMALS));

    // Approve slot machine to spend USDC
    await mockUSDC.connect(player1).approve(await slotMachine.getAddress(), ethers.parseUnits("1000", USDC_DECIMALS));
    await mockUSDC.connect(player2).approve(await slotMachine.getAddress(), ethers.parseUnits("1000", USDC_DECIMALS));
    await mockUSDC.connect(owner).approve(await slotMachine.getAddress(), ethers.parseUnits("10000", USDC_DECIMALS));

    // Set up mock Pyth price
    await mockPyth.setPrice(
      PYTH_FEED_ID,
      45000n * 10n**8n, // $45,000 BTC
      100n,             // ±$100 confidence
      -8,               // exponent
      Math.floor(Date.now() / 1000) // current timestamp
    );
  });

  describe("Initialization", function () {
    it("Should be initialized correctly", async function () {
      expect(await slotMachine.usdc()).to.equal(await mockUSDC.getAddress());
      expect(await slotMachine.pyth()).to.equal(await mockPyth.getAddress());
      expect(await slotMachine.manager()).to.equal(await manager.getAddress());
      expect(await slotMachine.pythFeedId()).to.equal(PYTH_FEED_ID);
      expect(await slotMachine.owner()).to.equal(owner.address);
    });

    it("Should have correct initial configuration", async function () {
      expect(await slotMachine.jackpotPercentage()).to.equal(500); // 5%
      expect(await slotMachine.houseEdge()).to.equal(500); // 5%
      expect(await slotMachine.spinsPerRandomnessRefresh()).to.equal(1000);
    });

    it("Should have correct bet amounts", async function () {
      const validBetAmounts = await slotMachine.getValidBetAmounts();
      expect(validBetAmounts.length).to.equal(BET_AMOUNTS.length);
      
      for (let i = 0; i < BET_AMOUNTS.length; i++) {
        expect(validBetAmounts[i]).to.equal(BET_AMOUNTS[i]);
      }
    });

    it("Should have correct payout configuration", async function () {
      const payoutConfig = await slotMachine.payoutConfig();
      expect(payoutConfig.threeBar).to.equal(1500);      // 15x
      expect(payoutConfig.twoBar).to.equal(800);         // 8x
      expect(payoutConfig.oneBar).to.equal(300);         // 3x
      expect(payoutConfig.threeCherries).to.equal(600);  // 6x
      expect(payoutConfig.threeWatermelon).to.equal(400); // 4x
      expect(payoutConfig.threeCoinbase).to.equal(1200); // 12x
    });

    it("Should have correct symbols", async function () {
      expect(await slotMachine.symbols(0)).to.equal("Bar");
      expect(await slotMachine.symbols(1)).to.equal("Cherries");
      expect(await slotMachine.symbols(2)).to.equal("Watermelon");
      expect(await slotMachine.symbols(3)).to.equal("CoinbaseLogo");
    });
  });

  describe("Spinning", function () {
    it("Should reject invalid bet amounts", async function () {
      const invalidAmount = ethers.parseUnits("3", USDC_DECIMALS); // Not in valid bet amounts
      
      await expect(
        slotMachine.connect(player1).spin(invalidAmount)
      ).to.be.revertedWith("Invalid bet amount");
    });

    it("Should reject zero bet amount", async function () {
      await expect(
        slotMachine.connect(player1).spin(0)
      ).to.be.revertedWith("Amount must be positive");
    });

    it("Should execute a spin successfully", async function () {
      const betAmount = ethers.parseUnits("1", USDC_DECIMALS);
      const initialBalance = await mockUSDC.balanceOf(player1.address);
      
      const tx = await slotMachine.connect(player1).spin(betAmount);
      const receipt = await tx.wait();

      // Check that USDC was transferred
      const finalBalance = await mockUSDC.balanceOf(player1.address);
      expect(finalBalance).to.equal(initialBalance - betAmount);

      // Check that spin event was emitted
      const spinEvent = receipt?.logs.find(log => {
        try {
          const parsed = slotMachine.interface.parseLog(log);
          return parsed?.name === "SpinExecuted";
        } catch {
          return false;
        }
      });
      expect(spinEvent).to.not.be.undefined;

      // Check spin count was updated
      const stats = await slotMachine.getSlotMachineStats();
      expect(stats.spinCount).to.equal(1);
    });

    it("Should generate provably fair randomness", async function () {
      const betAmount = ethers.parseUnits("1", USDC_DECIMALS);

      const tx1 = await slotMachine.connect(player1).spin(betAmount);
      const receipt1 = await tx1.wait();
      
      const tx2 = await slotMachine.connect(player1).spin(betAmount);
      const receipt2 = await tx2.wait();

      // Parse events to get random seeds
      const getRandomSeed = (receipt: any) => {
        const spinEvent = receipt.logs.find((log: any) => {
          try {
            const parsed = slotMachine.interface.parseLog(log);
            return parsed?.name === "SpinExecuted";
          } catch {
            return false;
          }
        });
        if (spinEvent) {
          const parsed = slotMachine.interface.parseLog(spinEvent);
          return parsed?.args.randomSeed;
        }
        return null;
      };

      const seed1 = getRandomSeed(receipt1);
      const seed2 = getRandomSeed(receipt2);

      expect(seed1).to.not.be.null;
      expect(seed2).to.not.be.null;
      expect(seed1).to.not.equal(seed2); // Different seeds for different spins
    });

    it("Should update randomness every N spins", async function () {
      const betAmount = ethers.parseUnits("1", USDC_DECIMALS);
      
      // Get initial randomness
      const initialStats = await slotMachine.getSlotMachineStats();
      const initialRandomness = initialStats.baseRandomness;
      
      // Spin 1000 times (should trigger randomness update)
      for (let i = 0; i < 1000; i++) {
        await slotMachine.connect(player1).spin(betAmount);
      }
      
      // Check that randomness was updated
      const finalStats = await slotMachine.getSlotMachineStats();
      expect(finalStats.baseRandomness).to.not.equal(initialRandomness);
      expect(finalStats.spinCount).to.equal(1000);
    });
  });

  describe("Payout Logic", function () {
    beforeEach(async function () {
      // Fund manager jackpot for testing
      await mockUSDC.connect(owner).approve(await manager.getAddress(), ethers.parseUnits("1000", USDC_DECIMALS));
      await manager.connect(owner).fundJackpot(ethers.parseUnits("1000", USDC_DECIMALS));
    });

    it("Should calculate correct payouts for different combinations", async function () {
      const betAmount = ethers.parseUnits("10", USDC_DECIMALS);
      
      // Test multiple spins to see different outcomes
      for (let i = 0; i < 10; i++) {
        const initialBalance = await mockUSDC.balanceOf(player1.address);
        
        const tx = await slotMachine.connect(player1).spin(betAmount);
        await tx.wait();
        
        const finalBalance = await mockUSDC.balanceOf(player1.address);
        
        // Get spin result
        const lastSpin = await slotMachine.lastSpin(player1.address);
        const payout = lastSpin.payout;
        
        if (payout > 0) {
          // If there was a payout, check that it was transferred correctly
          expect(finalBalance).to.equal(initialBalance - betAmount + payout);
        } else {
          // If no payout, player should have lost their bet
          expect(finalBalance).to.equal(initialBalance - betAmount);
        }
      }
    });

    it("Should contribute to jackpot pool", async function () {
      const betAmount = ethers.parseUnits("100", USDC_DECIMALS);
      const initialJackpot = (await manager.getManagerStats()).jackpotPool;
      
      await slotMachine.connect(player1).spin(betAmount);
      
      const finalJackpot = (await manager.getManagerStats()).jackpotPool;
      const expectedContribution = (betAmount * 500n) / 10000n; // 5% of bet
      
      expect(finalJackpot).to.equal(initialJackpot + expectedContribution);
    });

    it("Should handle jackpot wins correctly", async function () {
      const betAmount = ethers.parseUnits("1", USDC_DECIMALS);
      
      // Test multiple spins to potentially trigger jackpot (very unlikely but possible)
      for (let i = 0; i < 100; i++) {
        const initialBalance = await mockUSDC.balanceOf(player1.address);
        const initialJackpot = (await manager.getManagerStats()).jackpotPool;
        
        const tx = await slotMachine.connect(player1).spin(betAmount);
        await tx.wait();
        
        const lastSpin = await slotMachine.lastSpin(player1.address);
        const finalBalance = await mockUSDC.balanceOf(player1.address);
        
        if (lastSpin.wonJackpot) {
          expect(finalBalance).to.equal(initialBalance - betAmount + initialJackpot);
          expect((await manager.getManagerStats()).jackpotPool).to.equal(0); // Jackpot should be reset
          break; // Exit loop if jackpot was won
        }
      }
    });
  });

  describe("Randomness Management", function () {
    it("Should allow anyone to update randomness", async function () {
      const initialStats = await slotMachine.getSlotMachineStats();
      const initialRandomness = initialStats.baseRandomness;
      
      await slotMachine.connect(player1).updateRandomness();
      
      const finalStats = await slotMachine.getSlotMachineStats();
      expect(finalStats.baseRandomness).to.not.equal(initialRandomness);
    });

    it("Should get Pyth price correctly", async function () {
      const price = await slotMachine.getPythPrice();
      expect(price.price).to.equal(45000n * 10n**8n);
      expect(price.conf).to.equal(100n);
      expect(price.expo).to.equal(-8);
    });
  });

  describe("Player Data", function () {
    it("Should store spin history correctly", async function () {
      const betAmount = ethers.parseUnits("1", USDC_DECIMALS);
      
      await slotMachine.connect(player1).spin(betAmount);
      await slotMachine.connect(player1).spin(betAmount);
      
      const history = await slotMachine.getPlayerSpinHistory(player1.address);
      expect(history.length).to.equal(2);
      
      const lastSpin = await slotMachine.lastSpin(player1.address);
      expect(lastSpin.timestamp).to.be.greaterThan(0);
    });

    it("Should track total winnings", async function () {
      const betAmount = ethers.parseUnits("10", USDC_DECIMALS);
      
      // Spin multiple times
      for (let i = 0; i < 5; i++) {
        await slotMachine.connect(player1).spin(betAmount);
      }
      
      const totalWinnings = await slotMachine.totalWinnings(player1.address);
      expect(totalWinnings).to.be.greaterThanOrEqual(0);
    });
  });

  describe("Owner Functions", function () {
    it("Should allow owner to update configuration", async function () {
      const newJackpotPercentage = 600; // 6%
      const newHouseEdge = 400; // 4%
      
      await slotMachine.connect(owner).updateConfiguration(newJackpotPercentage, newHouseEdge);
      
      expect(await slotMachine.jackpotPercentage()).to.equal(newJackpotPercentage);
      expect(await slotMachine.houseEdge()).to.equal(newHouseEdge);
    });

    it("Should enforce limits on configuration", async function () {
      const tooHighJackpot = 1100; // 11%
      const tooHighHouseEdge = 1100; // 11%
      
      await expect(
        slotMachine.connect(owner).updateConfiguration(tooHighJackpot, 500)
      ).to.be.revertedWith("Jackpot percentage too high");
      
      await expect(
        slotMachine.connect(owner).updateConfiguration(500, tooHighHouseEdge)
      ).to.be.revertedWith("House edge too high");
    });

    it("Should allow owner to update payout configuration", async function () {
      const newConfig = {
        threeBar: 2000,        // 20x
        twoBar: 1000,          // 10x
        oneBar: 400,           // 4x
        threeCherries: 800,    // 8x
        threeWatermelon: 600,  // 6x
        threeCoinbase: 1600    // 16x
      };
      
      await slotMachine.connect(owner).updatePayoutConfig(newConfig);
      
      const payoutConfig = await slotMachine.payoutConfig();
      expect(payoutConfig.threeBar).to.equal(newConfig.threeBar);
      expect(payoutConfig.twoBar).to.equal(newConfig.twoBar);
      expect(payoutConfig.oneBar).to.equal(newConfig.oneBar);
      expect(payoutConfig.threeCherries).to.equal(newConfig.threeCherries);
      expect(payoutConfig.threeWatermelon).to.equal(newConfig.threeWatermelon);
      expect(payoutConfig.threeCoinbase).to.equal(newConfig.threeCoinbase);
    });

    it("Should allow owner to update bet amounts", async function () {
      const newBetAmounts = [
        ethers.parseUnits("2", USDC_DECIMALS),
        ethers.parseUnits("10", USDC_DECIMALS),
        ethers.parseUnits("50", USDC_DECIMALS),
      ];
      
      await slotMachine.connect(owner).updateBetAmounts(newBetAmounts);
      
      const validBetAmounts = await slotMachine.getValidBetAmounts();
      expect(validBetAmounts.length).to.equal(newBetAmounts.length);
      for (let i = 0; i < newBetAmounts.length; i++) {
        expect(validBetAmounts[i]).to.equal(newBetAmounts[i]);
      }
    });

    it("Should only allow owner to update configuration", async function () {
      await expect(
        slotMachine.connect(player1).updateConfiguration(600, 400)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Withdrawals", function () {
    beforeEach(async function () {
      // Fund the slot machine with USDC and ETH
      await mockUSDC.connect(owner).transfer(await slotMachine.getAddress(), ethers.parseUnits("100", USDC_DECIMALS));
      await owner.sendTransaction({
        to: await slotMachine.getAddress(),
        value: ethers.parseEther("0.1")
      });
    });

    it("Should allow owner to withdraw USDC", async function () {
      const withdrawAmount = ethers.parseUnits("50", USDC_DECIMALS);
      
      const initialBalance = await mockUSDC.balanceOf(owner.address);
      await slotMachine.connect(owner).withdrawUSDC(withdrawAmount);
      const finalBalance = await mockUSDC.balanceOf(owner.address);
      
      expect(finalBalance).to.equal(initialBalance + withdrawAmount);
    });

    it("Should allow owner to withdraw ETH", async function () {
      const withdrawAmount = ethers.parseEther("0.05");
      
      const initialBalance = await ethers.provider.getBalance(owner.address);
      await slotMachine.connect(owner).withdrawETH(withdrawAmount);
      const finalBalance = await ethers.provider.getBalance(owner.address);
      
      expect(finalBalance).to.equal(initialBalance + withdrawAmount);
    });

    it("Should only allow owner to withdraw", async function () {
      await expect(
        slotMachine.connect(player1).withdrawUSDC(ethers.parseUnits("10", USDC_DECIMALS))
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle insufficient USDC balance", async function () {
      const betAmount = ethers.parseUnits("1", USDC_DECIMALS);
      
      // Set player balance to 0
      await mockUSDC.connect(player1).transfer(owner.address, await mockUSDC.balanceOf(player1.address));
      
      await expect(
        slotMachine.connect(player1).spin(betAmount)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Should handle insufficient USDC allowance", async function () {
      const betAmount = ethers.parseUnits("1", USDC_DECIMALS);
      
      // Revoke allowance
      await mockUSDC.connect(player1).approve(await slotMachine.getAddress(), 0);
      
      await expect(
        slotMachine.connect(player1).spin(betAmount)
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Should handle ETH transfers", async function () {
      const ethAmount = ethers.parseEther("0.1");
      
      await owner.sendTransaction({
        to: await slotMachine.getAddress(),
        value: ethAmount
      });
      
      const contractBalance = await ethers.provider.getBalance(await slotMachine.getAddress());
      expect(contractBalance).to.equal(ethAmount);
    });
  });
});
