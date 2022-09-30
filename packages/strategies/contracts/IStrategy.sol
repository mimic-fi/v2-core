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

import '@mimic-fi/v2-registry/contracts/implementations/IImplementation.sol';

/**
 * @title IStrategy
 * @dev Strategy interface required by Mimic Wallet. It must follow the IImplementation interface.
 */
interface IStrategy is IImplementation {
    /**
     * @dev Tells the token that will be used as the strategy entry point
     */
    function token() external view returns (address);

    /**
     * @dev Tells how much a value unit means expressed in the strategy token.
     * For example, if a strategy has a value of 100 in T0, and then it has a value of 120 in T1,
     * and the value rate is 1.5, it means the strategy has earned 30 strategy tokens between T0 and T1.
     */
    function valueRate() external view returns (uint256);

    /**
     * @dev Tells the last value an account has over time. Note this value can be outdated: there could be rewards to
     * be claimed that will affect the accrued value. For example, if an account has a value of 100 in T0, and then it
     * has a value of 120 in T1, it means it gained a 20% between T0 and T1.
     * @param account Address of the account querying the last value of
     */
    function lastValue(address account) external view returns (uint256);

    /**
     * @dev Claim any existing rewards
     * @param data Arbitrary extra data
     * @return tokens Addresses of the tokens received as rewards
     * @return amounts Amounts of the tokens received as rewards
     */
    function claim(bytes memory data) external returns (address[] memory tokens, uint256[] memory amounts);

    /**
     * @dev Join the interfaced DeFi protocol
     * @param amount Amount of strategy tokens to join with
     * @param slippage Slippage value to join with
     * @param data Arbitrary extra data
     * @return value Value represented by the joined amount
     */
    function join(uint256 amount, uint256 slippage, bytes memory data) external returns (uint256 value);

    /**
     * @dev Exit the interfaced DeFi protocol
     * @param ratio Ratio to exit with
     * @param slippage Slippage value to exit with
     * @param data Arbitrary extra data
     * @return amount Amount of strategy tokens exited with
     * @return value Value represented by the exited amount
     */
    function exit(uint256 ratio, uint256 slippage, bytes memory data) external returns (uint256 amount, uint256 value);
}
