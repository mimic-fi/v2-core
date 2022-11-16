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

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Address.sol';

import '../interfaces/IOneInchV5AggregationRouter.sol';

import 'hardhat/console.sol';

/**
 * @title OneInchV5Connector
 * @dev Interfaces with 1inch V5 to swap tokens
 */
contract OneInchV5Connector {
    using SafeERC20 for IERC20;

    // Reference to 1inch aggregation router v5
    IOneInchV5AggregationRouter private immutable oneInchV5Router;

    /**
     * @dev Initializes the OneInchV5Connector contract
     * @param _oneInchV5Router 1inch aggregation router v5 reference
     */
    constructor(address _oneInchV5Router) {
        oneInchV5Router = IOneInchV5AggregationRouter(_oneInchV5Router);
    }

    /**
     * @dev Internal function to swap two tokens through 1Inch V5
     * @param tokenIn Token being sent
     * @param tokenOut Token being received
     * @param amountIn Amount of tokenIn being swapped
     * @param minAmountOut Minimum amount of tokenOut willing to receive
     * @param data Calldata to be sent to the 1inch aggregation router
     */
    function _swapOneInchV5(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) internal returns (uint256 amountOut) {
        uint256 preBalanceOut = IERC20(tokenOut).balanceOf(address(this));

        IERC20(tokenIn).safeApprove(address(oneInchV5Router), amountIn);
        Address.functionCall(address(oneInchV5Router), data, '1INCH_V5_SWAP_FAILED');

        uint256 postBalanceOut = IERC20(tokenOut).balanceOf(address(this));
        amountOut = postBalanceOut - preBalanceOut;
        require(amountOut >= minAmountOut, '1INCH_V5_MIN_AMOUNT');
    }
}
