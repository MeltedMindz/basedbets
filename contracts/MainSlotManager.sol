// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./SlotMachine.sol";

/**
 * @title MainSlotManager
 * @dev Central contract that manages slot machines and shared jackpot pool
 * @notice This contract deploys slot machine clones and manages a shared progressive jackpot
 */
contract MainSlotManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // USDC token on Base mainnet
    IERC20 public immutable usdc;
    
    // Slot machine implementation for cloning
    address public immutable slotMachineImplementation;
    
    // Registry of deployed slot machines
    address[] public slotMachines;
    mapping(address => bool) public isRegisteredSlotMachine;
    
    // Shared progressive jackpot pool
    uint256 public jackpotPool;
    
    // Configuration limits and defaults
    uint256 public constant MAX_JACKPOT_PERCENTAGE = 1000; // 10% max (in basis points)
    uint256 public constant MAX_HOUSE_EDGE = 1000; // 10% max (in basis points)
    uint256 public defaultJackpotPercentage = 500; // 5% default
    uint256 public defaultHouseEdge = 500; // 5% default
    uint256 public spinsPerRandomnessRefresh = 1000;
    
    // House wallet for receiving house edge
    address public houseWallet;
    
    // Statistics
    uint256 public totalVolume;
    uint256 public totalSpins;
    uint256 public totalJackpotWins;
    
    // Events
    event SlotMachineDeployed(address indexed slotMachine, address indexed owner);
    event JackpotDeposited(uint256 amount, address indexed slotMachine);
    event JackpotWon(address indexed winner, uint256 amount, address indexed slotMachine);
    event JackpotFunded(uint256 amount);
    event HouseWalletUpdated(address indexed newHouseWallet);
    event ConfigurationUpdated(uint256 jackpotPercentage, uint256 houseEdge, uint256 spinsPerRefresh);
    
    /**
     * @dev Constructor
     * @param _usdc USDC token address on Base mainnet
     * @param _houseWallet Initial house wallet address
     */
    constructor(address _usdc, address _houseWallet) {
        require(_usdc != address(0), "Invalid USDC address");
        require(_houseWallet != address(0), "Invalid house wallet");
        
        usdc = IERC20(_usdc);
        houseWallet = _houseWallet;
        
        // Deploy the slot machine implementation
        slotMachineImplementation = address(new SlotMachine());
        
        // Initialize the implementation (this will be disabled)
        SlotMachine(slotMachineImplementation).initialize(
            address(this), // manager
            address(this), // usdc (will be set correctly in clones)
            address(this), // pyth (will be set correctly in clones)
            bytes32(0),    // pythFeedId (will be set correctly in clones)
            address(this), // owner (will be set correctly in clones)
            _houseWallet   // houseWallet
        );
        
        // Disable the implementation by transferring ownership to dead address
        SlotMachine(slotMachineImplementation).transferOwnership(address(0x1));
    }
    
    /**
     * @dev Deploy a new slot machine clone
     * @param _pythAddress Pyth oracle address
     * @param _pythFeedId Pyth price feed ID for randomness
     * @param _cloneOwner Owner of the slot machine clone
     * @return cloneAddress Address of the deployed clone
     */
    function deployNewSlotMachine(
        address _pythAddress,
        bytes32 _pythFeedId,
        address _cloneOwner
    ) external onlyOwner returns (address cloneAddress) {
        require(_pythAddress != address(0), "Invalid Pyth address");
        require(_cloneOwner != address(0), "Invalid owner");
        
        // Create clone using OpenZeppelin Clones
        cloneAddress = Clones.clone(slotMachineImplementation);
        
        // Initialize the clone
        SlotMachine(cloneAddress).initialize(
            address(this),     // manager
            address(usdc),     // usdc
            _pythAddress,      // pyth
            _pythFeedId,       // pythFeedId
            _cloneOwner,       // owner
            houseWallet        // houseWallet
        );
        
        // Register the slot machine
        slotMachines.push(cloneAddress);
        isRegisteredSlotMachine[cloneAddress] = true;
        
        emit SlotMachineDeployed(cloneAddress, _cloneOwner);
        
        return cloneAddress;
    }
    
    /**
     * @dev Deposit to shared jackpot pool (called by slot machines)
     * @param amount Amount to deposit
     * @param slotMachine Address of the slot machine making the deposit
     */
    function depositToJackpot(uint256 amount, address slotMachine) external {
        require(isRegisteredSlotMachine[msg.sender], "Only registered slot machines");
        require(amount > 0, "Amount must be positive");
        
        // Transfer USDC from slot machine to this contract
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        
        // Add to jackpot pool
        jackpotPool += amount;
        
        emit JackpotDeposited(amount, slotMachine);
    }
    
    /**
     * @dev Try to win the jackpot (called by slot machines)
     * @param player Player address
     * @param betAmount Bet amount (affects jackpot odds)
     * @param slotMachine Address of the slot machine
     * @return won Whether the player won the jackpot
     * @return payout Amount won (0 if didn't win)
     */
    function tryJackpotWin(
        address player,
        uint256 betAmount,
        address slotMachine
    ) external nonReentrant returns (bool won, uint256 payout) {
        require(isRegisteredSlotMachine[msg.sender], "Only registered slot machines");
        require(player != address(0), "Invalid player address");
        require(betAmount > 0, "Invalid bet amount");
        
        // Calculate jackpot odds based on bet size
        // Higher bet = higher chance, but still very rare
        uint256 jackpotOdds = _calculateJackpotOdds(betAmount);
        
        // Generate random number for jackpot check using block data
        uint256 random = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.difficulty,
            block.number,
            tx.origin,
            player,
            betAmount,
            jackpotPool,
            block.coinbase
        ))) % 1000000; // 1 in 1,000,000 base odds
        
        if (random < jackpotOdds && jackpotPool > 0) {
            // Player wins the jackpot!
            payout = jackpotPool;
            jackpotPool = 0;
            
            // Transfer jackpot to slot machine for payout to player
            usdc.safeTransfer(msg.sender, payout);
            
            totalJackpotWins++;
            
            emit JackpotWon(player, payout, slotMachine);
            
            return (true, payout);
        }
        
        return (false, 0);
    }
    
    /**
     * @dev Calculate jackpot odds based on bet amount
     * @param betAmount Bet amount
     * @return odds Odds (out of 1,000,000)
     */
    function _calculateJackpotOdds(uint256 betAmount) internal pure returns (uint256 odds) {
        // Base odds: 1 in 1,000,000
        // Scale with bet amount: minimum bet (1 USDC) = 1x odds, higher bets get better odds
        uint256 baseOdds = 1; // 1 in 1,000,000
        
        // Scale odds based on bet amount (max 100x multiplier for 100 USDC bet)
        uint256 multiplier = (betAmount / 1e6) * 100; // Convert to USDC amount and scale
        if (multiplier > 10000) multiplier = 10000; // Cap at 100x multiplier
        
        odds = baseOdds * multiplier;
        if (odds > 10000) odds = 10000; // Cap at 1 in 100,000 odds
    }
    
    /**
     * @dev Fund jackpot pool manually
     * @param amount Amount to fund
     */
    function fundJackpot(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be positive");
        
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        jackpotPool += amount;
        
        emit JackpotFunded(amount);
    }
    
    /**
     * @dev Update house wallet
     * @param _houseWallet New house wallet address
     */
    function updateHouseWallet(address _houseWallet) external onlyOwner {
        require(_houseWallet != address(0), "Invalid house wallet");
        houseWallet = _houseWallet;
        
        emit HouseWalletUpdated(_houseWallet);
    }
    
    /**
     * @dev Update configuration parameters
     * @param _jackpotPercentage New jackpot percentage (in basis points)
     * @param _houseEdge New house edge (in basis points)
     * @param _spinsPerRefresh New spins per randomness refresh
     */
    function updateConfiguration(
        uint256 _jackpotPercentage,
        uint256 _houseEdge,
        uint256 _spinsPerRefresh
    ) external onlyOwner {
        require(_jackpotPercentage <= MAX_JACKPOT_PERCENTAGE, "Jackpot percentage too high");
        require(_houseEdge <= MAX_HOUSE_EDGE, "House edge too high");
        require(_spinsPerRefresh > 0, "Invalid spins per refresh");
        
        defaultJackpotPercentage = _jackpotPercentage;
        defaultHouseEdge = _houseEdge;
        spinsPerRandomnessRefresh = _spinsPerRefresh;
        
        emit ConfigurationUpdated(_jackpotPercentage, _houseEdge, _spinsPerRefresh);
    }
    
    /**
     * @dev Withdraw USDC to house wallet
     * @param amount Amount to withdraw
     */
    function withdrawUSDC(uint256 amount) external onlyOwner {
        require(houseWallet != address(0), "House wallet not set");
        require(amount <= usdc.balanceOf(address(this)), "Insufficient balance");
        
        usdc.safeTransfer(houseWallet, amount);
    }
    
    /**
     * @dev Withdraw ETH to house wallet
     * @param amount Amount to withdraw
     */
    function withdrawETH(uint256 amount) external onlyOwner {
        require(houseWallet != address(0), "House wallet not set");
        require(amount <= address(this).balance, "Insufficient ETH balance");
        
        payable(houseWallet).transfer(amount);
    }
    
    /**
     * @dev Get total number of deployed slot machines
     * @return count Number of slot machines
     */
    function getSlotMachineCount() external view returns (uint256 count) {
        return slotMachines.length;
    }
    
    /**
     * @dev Get slot machine address by index
     * @param index Index in the array
     * @return slotMachine Address of the slot machine
     */
    function getSlotMachine(uint256 index) external view returns (address slotMachine) {
        require(index < slotMachines.length, "Index out of bounds");
        return slotMachines[index];
    }
    
    /**
     * @dev Get all deployed slot machines
     * @return machines Array of slot machine addresses
     */
    function getAllSlotMachines() external view returns (address[] memory machines) {
        return slotMachines;
    }
    
    /**
     * @dev Get manager statistics
     * @return _totalVolume Total volume across all slot machines
     * @return _totalSpins Total spins across all slot machines
     * @return _totalJackpotWins Total jackpot wins
     * @return _jackpotPool Current jackpot pool size
     * @return _slotMachineCount Number of deployed slot machines
     */
    function getManagerStats() external view returns (
        uint256 _totalVolume,
        uint256 _totalSpins,
        uint256 _totalJackpotWins,
        uint256 _jackpotPool,
        uint256 _slotMachineCount
    ) {
        return (
            totalVolume,
            totalSpins,
            totalJackpotWins,
            jackpotPool,
            slotMachines.length
        );
    }
    
    /**
     * @dev Update statistics (called by slot machines)
     * @param volume Volume to add
     * @param spins Spins to add
     */
    function updateStats(uint256 volume, uint256 spins) external {
        require(isRegisteredSlotMachine[msg.sender], "Only registered slot machines");
        totalVolume += volume;
        totalSpins += spins;
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