// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MockPyth
 * @dev Mock Pyth oracle for testing purposes
 */
contract MockPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint publishTime;
    }
    
    mapping(bytes32 => Price) public prices;
    
    /**
     * @dev Get price data (unsafe version for testing)
     * @param id Price feed ID
     * @return price Price data
     */
    function getPriceUnsafe(bytes32 id) external view returns (Price memory price) {
        return prices[id];
    }
    
    /**
     * @dev Get price data
     * @param id Price feed ID
     * @return price Price data
     */
    function getPrice(bytes32 id) external view returns (Price memory price) {
        return prices[id];
    }
    
    /**
     * @dev Set price data for testing
     * @param id Price feed ID
     * @param price Price value
     * @param conf Confidence interval
     * @param expo Exponent
     * @param publishTime Publish timestamp
     */
    function setPrice(
        bytes32 id,
        int64 price,
        uint64 conf,
        int32 expo,
        uint publishTime
    ) external {
        prices[id] = Price({
            price: price,
            conf: conf,
            expo: expo,
            publishTime: publishTime
        });
    }
    
    /**
     * @dev Update price feeds (mock implementation)
     * @param updateData Update data
     */
    function updatePriceFeeds(bytes[] calldata updateData) external payable {
        // Mock implementation - in real Pyth, this would update price feeds
        emit PriceFeedsUpdated(updateData.length);
    }
    
    event PriceFeedsUpdated(uint256 updateCount);
}
