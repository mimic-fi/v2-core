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

pragma solidity >=0.8.0;

import '@mimic-fi/v2-helpers/contracts/auth/IAuthorizer.sol';
import '@mimic-fi/v2-registry/contracts/implementations/IImplementation.sol';

/**
 * @title IPriceOracle
 * @dev Oracle that interfaces with external feeds to provide quotes for tokens based on any other token.
 * It must support also `IImplementation` and `IAuthorizer`
 */
interface IPriceOracle is IImplementation, IAuthorizer {
    /**
     * @dev Emitted every time a price feed is set for (base, quote) pair
     */
    event FeedSet(address indexed base, address indexed quote, address feed);

    /**
     * @dev Tells whether there is a price feed address set for a (base, quote) pair or not.
     * @param base Token to be rated
     * @param quote Token used for the price rate
     */
    function hasFeed(address base, address quote) external view returns (bool);

    /**
     * @dev Tells the price feed address for (base, quote) pair. It returns the zero address if there is no one set.
     * @param base Token to be rated
     * @param quote Token used for the price rate
     */
    function getFeed(address base, address quote) external view returns (address);

    /**
     * @dev Tells the price of a token (base) in a given quote. The response is expressed using the corresponding
     * number of decimals so that when performing a fixed point product of it by a `base` amount it results in
     * a value expressed in `quote` decimals. For example, if `base` is ETH and `quote` is USDC, then the returned
     * value is expected to be expressed using 6 decimals:
     *
     * FixedPoint.mul(X[ETH], price[ETH/USDC]) = FixedPoint.mul(X[18], price[6]) = X * price [6]
     *
     * @param base Token to rate
     * @param quote Token used for the price rate
     */
    function getPrice(address base, address quote) external view returns (uint256);

    /**
     * @dev Sets a list of price feeds
     * @param bases List of token bases to be set
     * @param quotes List of token quotes to be set
     * @param feeds List of price feeds to be set
     */
    function setFeeds(address[] memory bases, address[] memory quotes, address[] memory feeds) external;
}
