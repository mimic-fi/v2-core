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

interface IPriceOracle {
    event FeedSet(address indexed base, address indexed quote, address feed);

    function hasFeed(address base, address quote) external view returns (bool);

    function getFeed(address base, address quote) external view returns (address);

    /**
     * @dev Tells the price of a token (base) in a given quote. The response is expressed using the corresponding
     *      number of decimals so that when performing a fixed point product of it by a `quote` amount it results in
     *      a value expressed in `base` decimals. For example, if `base` is USDC and `quote` is ETH, then the
     *      returned value is expected to be expressed using 6 decimals.
     *      Note that custom feeds are used if set, otherwise it fallbacks to ChainLink feeds registry.
     *
     *      FixedPoint.mul(X[ETH], price[USDC/ETH]) =  FixedPoint.mul(X[18], price[6]) = X * price [6]
     *
     * @param base Token to rate
     * @param quote Token used for the price rate
     */
    function getPrice(address base, address quote) external view returns (uint256);

    function setFeeds(address[] memory bases, address[] memory quotes, address[] memory feeds) external;

    function setRegisteredFeeds(address[] memory bases, address[] memory quotes, address[] memory feeds) external;
}
