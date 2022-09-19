// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.8.0;

import '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/utils/math/SafeCast.sol';

import '@mimic-fi/v2-helpers/contracts/math/FixedPoint.sol';
import '@mimic-fi/v2-helpers/contracts/math/UncheckedMath.sol';
import '@mimic-fi/v2-registry/contracts/implementations/InitializableAuthorizedImplementation.sol';

import './IPriceOracle.sol';

/**
 * @title PriceOracle
 * @dev Oracle that interfaces with external feeds to provide quotes for tokens based on any other token.
 *
 * It inherits from InitializableAuthorizedImplementation which means it's implementation can be cloned
 * from the Mimic Registry and should be initialized depending on each case.
 *
 * This Price Oracle only operates with ERC20 tokens, it does not allow querying quotes for any other denomination.
 * Additionally, it only supports external feeds that implement ChainLink's proposed `AggregatorV3Interface` interface.
 */
contract PriceOracle is IPriceOracle, InitializableAuthorizedImplementation {
    using FixedPoint for uint256;
    using UncheckedMath for uint256;

    // Internal namespace followed to set feeds
    bytes32 public constant FEEDS_NAMESPACE = keccak256('PRICE_ORACLE_FEEDS');

    // Namespace used for this price oracle implementation
    bytes32 public constant override NAMESPACE = keccak256('PRICE_ORACLE');

    // Number of decimals used for fixed point operations: 18
    uint256 private constant FP_DECIMALS = 18;

    // Maximum number of decimals supported for a token when computing inverse quotes: 36
    uint256 private constant INVERSE_FEED_MAX_DECIMALS = 36;

    // It allows denoting a single token to pivot between feeds in case a direct path is not available
    address public immutable pivot;

    // Mapping of price feeds from "token A" to "token B"
    mapping (address => mapping (address => address)) public feeds;

    /**
     * @dev Initializes the price oracle implementation with references that should be shared among all implementations
     * @param _pivot Address of the token to be used as the pivot
     * @param _registry Address of the Mimic Registry to be referenced
     */
    constructor(address _pivot, address _registry) InitializableAuthorizedImplementation(_registry) {
        pivot = _pivot;
    }

    /**
     * @dev Initializes the price oracle instance
     * @param admin Address that will be granted with admin rights
     */
    function initialize(address admin) external initializer {
        _initialize(admin);
    }

    /**
     * @dev Tells the price feed address for (base, quote) pair. It returns the zero address if there is no one set.
     * @param base Token to be rated
     * @param quote Token used for the price rate
     */
    function getFeed(address base, address quote) public view override returns (address) {
        return feeds[base][quote];
    }

    /**
     * @dev Tells whether there is a price feed address set for a (base, quote) pair or not.
     * @param base Token to be rated
     * @param quote Token used for the price rate
     */
    function hasFeed(address base, address quote) public view override returns (bool) {
        return getFeed(base, quote) != address(0);
    }

    /**
     * @dev Tells the price of a token (base) in a given quote. The response is expressed using the corresponding
     * number of decimals so that when performing a fixed point product of it by a `base` amount it results in
     * a value expressed in `quote` decimals.
     * @param base Token to rate
     * @param quote Token used for the price rate
     */
    function getPrice(address base, address quote) external view override returns (uint256) {
        // If `base * result / 1e18` must be expressed in `quote` decimals, then
        uint256 baseDecimals = IERC20Metadata(base).decimals();
        uint256 quoteDecimals = IERC20Metadata(quote).decimals();

        // No need for checked math as an uint8 + FP_DECIMALS (constant) will always fit in an uint256
        require(baseDecimals <= quoteDecimals.uncheckedAdd(FP_DECIMALS), 'BASE_DECIMALS_TOO_BIG');

        // No need for checked math as we are checking it manually beforehand
        uint256 resultDecimals = quoteDecimals.uncheckedAdd(FP_DECIMALS).uncheckedSub(baseDecimals);
        (uint256 price, uint256 decimals) = _getPrice(base, quote);
        return _scalePrice(price, decimals, resultDecimals);
    }

    /**
     * @dev Sets a list of price feeds. Sender must be authorized.
     * @param bases List of token bases to be set
     * @param quotes List of token quotes to be set
     * @param priceFeeds List of price feeds to be set
     */
    function setFeeds(address[] memory bases, address[] memory quotes, address[] memory priceFeeds)
        external
        override
        auth
    {
        require(bases.length == quotes.length, 'SET_FEEDS_INVALID_QUOTES_LENGTH');
        require(bases.length == priceFeeds.length, 'SET_FEEDS_INVALID_FEEDS_LENGTH');
        for (uint256 i = 0; i < bases.length; i = i.uncheckedAdd(1)) _setFeed(bases[i], quotes[i], priceFeeds[i]);
    }

    /**
     * @dev Internal function to tell the price of a token (base) in a given quote.
     * @param base Token to rate
     * @param quote Token used for the price rate
     * @return price Requested price rate
     * @return decimals Decimals of the requested price rate
     */
    function _getPrice(address base, address quote) internal view returns (uint256 price, uint256 decimals) {
        if (hasFeed(base, quote)) return _getDirectPrice(base, quote);
        else if (hasFeed(quote, base)) return _getInversePrice(base, quote);
        else return _getPivotPrice(base, quote);
    }

    /**
     * @dev Internal function to tell the price of a token (base) in a given quote using it's direct price feed.
     * It reverts if there is no price feed set for the given pair.
     * @param base Token to rate
     * @param quote Token used for the price rate
     * @return price Requested price rate
     * @return decimals Decimals of the requested price rate
     */
    function _getDirectPrice(address base, address quote) internal view returns (uint256 price, uint256 decimals) {
        address feed = getFeed(base, quote);
        (price, decimals) = _getFeedData(feed);
    }

    /**
     * @dev Internal function to tell the price of a token (base) in a given quote using the inverse price feed.
     * It reverts if there is no price feed set for the given pair.
     * @param base Token to rate
     * @param quote Token used for the price rate
     * @return price Requested price rate
     * @return decimals Decimals of the requested price rate
     */
    function _getInversePrice(address base, address quote) internal view returns (uint256 price, uint256 decimals) {
        address feed = getFeed(quote, base);
        (uint256 inversePrice, uint256 feedDecimals) = _getFeedData(feed);
        require(feedDecimals <= INVERSE_FEED_MAX_DECIMALS, 'FEED_DECIMALS_TOO_BIG');

        // TODO: review rounding
        price = FixedPoint.ONE.divDown(inversePrice);
        // No need for checked math as we are checking it manually beforehand
        decimals = INVERSE_FEED_MAX_DECIMALS.uncheckedSub(feedDecimals);
    }

    /**
     * @dev Internal function to tell the price of a token (base) in a given quote using pivot price feeds.
     * It reverts if there is no pivot price feeds set for the given pair.
     * @param base Token to rate
     * @param quote Token used for the price rate
     * @return price Requested price rate
     * @return decimals Decimals of the requested price rate
     */
    function _getPivotPrice(address base, address quote) internal view returns (uint256 price, uint256 decimals) {
        address baseFeed = getFeed(base, pivot);
        require(baseFeed != address(0), 'MISSING_BASE_PIVOT_FEED');

        address quoteFeed = getFeed(quote, pivot);
        require(quoteFeed != address(0), 'MISSING_QUOTE_PIVOT_FEED');

        (uint256 basePrice, uint256 baseFeedDecimals) = _getFeedData(baseFeed);
        (uint256 quotePrice, uint256 quoteFeedDecimals) = _getFeedData(quoteFeed);
        // No need for checked math as an uint8 + FP_DECIMALS (constant) will always fit in an uint256
        require(quoteFeedDecimals <= baseFeedDecimals + FP_DECIMALS, 'QUOTE_FEED_DECIMALS_TOO_BIG');

        // TODO: review rounding
        // Price is base/quote = (base/pivot) / (quote/pivot)
        price = basePrice.divDown(quotePrice);
        // No need for checked math as we are checking it manually beforehand
        decimals = baseFeedDecimals.uncheckedAdd(FP_DECIMALS).uncheckedSub(quoteFeedDecimals);
    }

    /**
     * @dev Internal function to fetch data from a price feed
     * @param feed Address of the price feed to fetch data from. It must support ChainLink's `AggregatorV3Interface`.
     * @return price Requested price
     * @return decimals Decimals of the requested price
     */
    function _getFeedData(address feed) internal view returns (uint256 price, uint256 decimals) {
        decimals = AggregatorV3Interface(feed).decimals();
        (, int256 priceInt, , , ) = AggregatorV3Interface(feed).latestRoundData();
        price = SafeCast.toUint256(priceInt);
    }

    /**
     * @dev Internal function to upscale or downscale a price rate
     * @param price Value to be scaled
     * @param priceDecimals Decimals in which `price` is originally represented
     * @return resultDecimals Decimals requested for the result
     */
    function _scalePrice(uint256 price, uint256 priceDecimals, uint256 resultDecimals) internal pure returns (uint256) {
        return
            resultDecimals >= priceDecimals
                ? (price * 10**(resultDecimals.uncheckedSub(priceDecimals)))
                : (price / 10**(priceDecimals.uncheckedSub(resultDecimals)));
    }

    /**
     * @dev Internal function to set a price feed
     * @param base Token base to be set
     * @param quote Token quote to be set
     * @param feed Price feeds to be set
     */
    function _setFeed(address base, address quote, address feed) internal {
        if (feed != address(0)) _validateDependency(feeds[base][quote], feed);
        feeds[base][quote] = feed;
        emit FeedSet(base, quote, feed);
    }
}
