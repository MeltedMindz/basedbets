// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./MainSlotManager.sol";

// Pyth Network integration
interface IPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint publishTime;
    }
    
    function getPriceUnsafe(bytes32 id) external view returns (Price memory price);
    function getPrice(bytes32 id) external view returns (Price memory price);
}

/**
 * @title SlotMachine
 * @dev Cloneable slot machine contract that integrates with MainSlotManager
 * @notice This contract handles individual slot machine operations and contributes to shared jackpot
 */
contract SlotMachine is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Main slot manager contract
    MainSlotManager public immutable manager;
    
    // USDC token
    IERC20 public immutable usdc;
    
    // Pyth Network integration
    IPyth public immutable pyth;
    bytes32 public immutable pythFeedId;
    
    // House wallet for receiving house edge
    address public immutable houseWallet;
    
    // Configuration (set by manager defaults)
    uint256 public jackpotPercentage = 500; // 5% (in basis points)
    uint256 public houseEdge = 500; // 5% (in basis points)
    uint256 public spinsPerRandomnessRefresh = 1000;
    
    // Game state
    uint256 public spinCount;
    uint256 public baseRandomness;
    uint256 public lastRandomnessUpdate;
    
    // Betting configuration
    uint256[] public betAmounts;
    
    // Slot machine symbols (0=Bar, 1=Cherries, 2=Watermelon, 3=CoinbaseLogo)
    string[4] public symbols = ["Bar", "Cherries", "Watermelon", "CoinbaseLogo"];
    
    // Payout multipliers (tuned for ~90% RTP)
    struct PayoutConfig {
        uint256 threeBar;      // 15x (rare)
        uint256 twoBar;        // 8x
        uint256 oneBar;        // 3x
        uint256 threeCherries; // 6x
        uint256 threeWatermelon; // 4x
        uint256 threeCoinbase;  // 12x (rare)
    }
    
    PayoutConfig public payoutConfig = PayoutConfig({
        threeBar: 1500,        // 15x
        twoBar: 800,           // 8x
        oneBar: 300,           // 3x
        threeCherries: 600,    // 6x
        threeWatermelon: 400,  // 4x
        threeCoinbase: 1200    // 12x
    });
    
    // Player data
    struct SpinResult {
        uint8[3] reels;
        uint256 payout;
        bool wonJackpot;
        uint256 timestamp;
        uint256 betAmount;
        uint256 randomSeed;
    }
    
    mapping(address => SpinResult) public lastSpin;
    mapping(address => SpinResult[]) public spinHistory;
    mapping(address => uint256) public totalWinnings;
    
    // Events
    event SpinExecuted(
        address indexed player,
        uint8[3] reels,
        uint256 payout,
        bool wonJackpot,
        uint256 betAmount,
        uint256 randomSeed
    );
    
    event RandomnessUpdated(uint256 newBaseRandomness, uint256 spinCount);
    event ConfigurationUpdated(uint256 jackpotPercentage, uint256 houseEdge);
    
    // Initialization flag
    bool private initialized;
    
    /**
     * @dev Initialize the slot machine (for clones)
     * @param _manager Main slot manager address
     * @param _usdc USDC token address
     * @param _pyth Pyth oracle address
     * @param _pythFeedId Pyth price feed ID
     * @param _owner Owner of this slot machine
     * @param _houseWallet House wallet address
     */
    function initialize(
        address _manager,
        address _usdc,
        address _pyth,
        bytes32 _pythFeedId,
        address _owner,
        address _houseWallet
    ) external {
        require(!initialized, "Already initialized");
        require(_manager != address(0), "Invalid manager");
        require(_usdc != address(0), "Invalid USDC");
        require(_pyth != address(0), "Invalid Pyth");
        require(_owner != address(0), "Invalid owner");
        require(_houseWallet != address(0), "Invalid house wallet");
        
        manager = MainSlotManager(_manager);
        usdc = IERC20(_usdc);
        pyth = IPyth(_pyth);
        pythFeedId = _pythFeedId;
        houseWallet = _houseWallet;
        
        // Set initial bet amounts (in USDC, 6 decimals)
        betAmounts = [
            1 * 10**6,    // 1 USDC
            5 * 10**6,    // 5 USDC
            10 * 10**6,   // 10 USDC
            25 * 10**6,   // 25 USDC
            50 * 10**6,   // 50 USDC
            100 * 10**6   // 100 USDC
        ];
        
        // Initialize randomness
        _updateRandomness();
        
        // Transfer ownership
        _transferOwnership(_owner);
        
        initialized = true;
    }
    
    /**
     * @dev Execute a spin
     * @param amount Bet amount (must be in valid bet amounts)
     */
    function spin(uint256 amount) external nonReentrant {
        require(initialized, "Not initialized");
        require(_isValidBetAmount(amount), "Invalid bet amount");
        require(amount > 0, "Amount must be positive");
        
        // Transfer USDC from player to contract
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        
        // Check if we need to update randomness
        if (spinCount % spinsPerRandomnessRefresh == 0) {
            _updateRandomness();
        }
        
        // Generate random seed for this spin
        uint256 randomSeed = _generateRandomSeed();
        
        // Execute spin logic
        (uint8[3] memory reels, uint256 payout, bool wonJackpot) = _executeSpin(randomSeed, amount);
        
        // Update spin count
        spinCount++;
        
        // Calculate jackpot contribution (5% of bet)
        uint256 jackpotContribution = (amount * jackpotPercentage) / 10000;
        
        // Send jackpot contribution to manager
        if (jackpotContribution > 0) {
            usdc.safeApprove(address(manager), jackpotContribution);
            manager.depositToJackpot(jackpotContribution, address(this));
        }
        
        // Calculate house fee (5% of bet)
        uint256 houseFee = (amount * houseEdge) / 10000;
        
        // Send house fee to house wallet
        if (houseFee > 0) {
            usdc.safeTransfer(houseWallet, houseFee);
        }
        
        // Try jackpot win
        if (!wonJackpot) {
            (bool jackpotWon, uint256 jackpotPayout) = manager.tryJackpotWin(msg.sender, amount, address(this));
            if (jackpotWon) {
                wonJackpot = true;
                payout = jackpotPayout;
            }
        }
        
        // Calculate final payout (after house edge deduction from winnings)
        uint256 finalPayout = payout;
        if (payout > 0 && !wonJackpot) {
            // Apply house edge to regular winnings (not jackpot)
            uint256 houseEdgeOnWinnings = (payout * houseEdge) / 10000;
            finalPayout = payout - houseEdgeOnWinnings;
            
            // Send house edge to house wallet
            usdc.safeTransfer(houseWallet, houseEdgeOnWinnings);
        }
        
        // Pay out winnings
        if (finalPayout > 0) {
            usdc.safeTransfer(msg.sender, finalPayout);
            totalWinnings[msg.sender] += finalPayout;
        }
        
        // Store spin result
        SpinResult memory result = SpinResult({
            reels: reels,
            payout: finalPayout,
            wonJackpot: wonJackpot,
            timestamp: block.timestamp,
            betAmount: amount,
            randomSeed: randomSeed
        });
        
        lastSpin[msg.sender] = result;
        spinHistory[msg.sender].push(result);
        
        // Update manager stats
        manager.updateStats(amount, 1);
        
        emit SpinExecuted(msg.sender, reels, finalPayout, wonJackpot, amount, randomSeed);
    }
    
    /**
     * @dev Update randomness from Pyth (callable by anyone)
     */
    function updateRandomness() external {
        _updateRandomness();
    }
    
    /**
     * @dev Internal function to update randomness
     */
    function _updateRandomness() internal {
        // Get latest Pyth price
        IPyth.Price memory price = pyth.getPriceUnsafe(pythFeedId);
        
        // Generate new base randomness combining Pyth data with block data
        baseRandomness = uint256(keccak256(abi.encodePacked(
            price.price,
            price.conf,
            price.expo,
            price.publishTime,
            block.timestamp,
            block.difficulty,
            block.number,
            spinCount,
            tx.origin
        )));
        
        lastRandomnessUpdate = block.timestamp;
        
        emit RandomnessUpdated(baseRandomness, spinCount);
    }
    
    /**
     * @dev Generate random seed for a spin
     * @return seed Random seed for the spin
     */
    function _generateRandomSeed() internal view returns (uint256 seed) {
        return uint256(keccak256(abi.encodePacked(
            baseRandomness,
            block.timestamp,
            tx.origin,
            msg.sender,
            spinCount
        )));
    }
    
    /**
     * @dev Execute spin logic and determine outcome
     * @param randomSeed Random seed for this spin
     * @param betAmount Bet amount
     * @return reels Reel positions
     * @return payout Payout amount
     * @return wonJackpot Whether jackpot was won
     */
    function _executeSpin(uint256 randomSeed, uint256 betAmount) 
        internal 
        view 
        returns (uint8[3] memory reels, uint256 payout, bool wonJackpot) 
    {
        // Generate reel positions using the random seed
        reels[0] = uint8((randomSeed >> 0) % 4);
        reels[1] = uint8((randomSeed >> 8) % 4);
        reels[2] = uint8((randomSeed >> 16) % 4);
        
        // Calculate payout based on symbol combinations
        payout = _calculatePayout(reels, betAmount);
        
        return (reels, payout, false); // Jackpot is handled separately
    }
    
    /**
     * @dev Calculate payout based on reel combinations
     * @param reels Reel positions
     * @param betAmount Bet amount
     * @return payout Calculated payout
     */
    function _calculatePayout(uint8[3] memory reels, uint256 betAmount) 
        internal 
        view 
        returns (uint256 payout) 
    {
        // Count symbols
        uint256[4] memory symbolCounts;
        for (uint i = 0; i < 3; i++) {
            symbolCounts[reels[i]]++;
        }
        
        // Check for winning combinations
        if (symbolCounts[0] == 3) { // 3x Bar
            return (betAmount * payoutConfig.threeBar) / 100;
        } else if (symbolCounts[0] == 2) { // 2x Bar
            return (betAmount * payoutConfig.twoBar) / 100;
        } else if (symbolCounts[0] == 1) { // 1x Bar
            return (betAmount * payoutConfig.oneBar) / 100;
        } else if (symbolCounts[1] == 3) { // 3x Cherries
            return (betAmount * payoutConfig.threeCherries) / 100;
        } else if (symbolCounts[2] == 3) { // 3x Watermelon
            return (betAmount * payoutConfig.threeWatermelon) / 100;
        } else if (symbolCounts[3] == 3) { // 3x Coinbase Logo
            return (betAmount * payoutConfig.threeCoinbase) / 100;
        }
        
        return 0; // No winning combination
    }
    
    /**
     * @dev Check if bet amount is valid
     * @param amount Bet amount to check
     * @return valid Whether the amount is valid
     */
    function _isValidBetAmount(uint256 amount) internal view returns (bool valid) {
        for (uint i = 0; i < betAmounts.length; i++) {
            if (betAmounts[i] == amount) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * @dev Get current Pyth price
     * @return price Current Pyth price data
     */
    function getPythPrice() external view returns (IPyth.Price memory price) {
        return pyth.getPriceUnsafe(pythFeedId);
    }
    
    /**
     * @dev Get player's spin history
     * @param player Player address
     * @return history Array of spin results
     */
    function getPlayerSpinHistory(address player) external view returns (SpinResult[] memory history) {
        return spinHistory[player];
    }
    
    /**
     * @dev Get valid bet amounts
     * @return amounts Array of valid bet amounts
     */
    function getValidBetAmounts() external view returns (uint256[] memory amounts) {
        return betAmounts;
    }
    
    /**
     * @dev Get slot machine statistics
     * @return _spinCount Total spins on this slot machine
     * @return _baseRandomness Current base randomness
     * @return _lastRandomnessUpdate Timestamp of last randomness update
     */
    function getSlotMachineStats() external view returns (
        uint256 _spinCount,
        uint256 _baseRandomness,
        uint256 _lastRandomnessUpdate
    ) {
        return (spinCount, baseRandomness, lastRandomnessUpdate);
    }
    
    // Owner functions
    
    /**
     * @dev Update configuration (limited by manager settings)
     * @param _jackpotPercentage New jackpot percentage (in basis points)
     * @param _houseEdge New house edge (in basis points)
     */
    function updateConfiguration(uint256 _jackpotPercentage, uint256 _houseEdge) external onlyOwner {
        require(_jackpotPercentage <= manager.MAX_JACKPOT_PERCENTAGE(), "Jackpot percentage too high");
        require(_houseEdge <= manager.MAX_HOUSE_EDGE(), "House edge too high");
        
        jackpotPercentage = _jackpotPercentage;
        houseEdge = _houseEdge;
        
        emit ConfigurationUpdated(_jackpotPercentage, _houseEdge);
    }
    
    /**
     * @dev Update payout configuration
     * @param _config New payout configuration
     */
    function updatePayoutConfig(PayoutConfig calldata _config) external onlyOwner {
        payoutConfig = _config;
    }
    
    /**
     * @dev Update bet amounts
     * @param _amounts New bet amounts array
     */
    function updateBetAmounts(uint256[] calldata _amounts) external onlyOwner {
        require(_amounts.length > 0, "Invalid amounts");
        betAmounts = _amounts;
    }
    
    /**
     * @dev Withdraw USDC (owner only)
     * @param amount Amount to withdraw
     */
    function withdrawUSDC(uint256 amount) external onlyOwner {
        require(amount <= usdc.balanceOf(address(this)), "Insufficient balance");
        usdc.safeTransfer(owner(), amount);
    }
    
    /**
     * @dev Withdraw ETH (owner only)
     * @param amount Amount to withdraw
     */
    function withdrawETH(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient ETH balance");
        payable(owner()).transfer(amount);
    }
    
    /**
     * @dev Receive ETH
     */
    receive() external payable {}
    
    /**
     * @dev Fallback function
     */
    fallback() external payable {}
}