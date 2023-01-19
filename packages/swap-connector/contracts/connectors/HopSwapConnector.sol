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

import '@mimic-fi/v2-helpers/contracts/utils/ERC20Helpers.sol';

import '../interfaces/IHopSwap.sol';

/**
 * @title HopSwapConnector
 * @dev Interfaces with Hop Swap to swap tokens
 */
contract HopSwapConnector {
    // Expected data length for Hop swaps: Hop Swap pool address
    uint256 private constant ENCODED_DATA_SWAP_LENGTH = 32;

    /**
     * @dev Internal function to swap two tokens through Hop
     * @param tokenIn Token being sent
     * @param tokenOut Token being received
     * @param amountIn Amount of tokenIn being swapped
     * @param minAmountOut Minimum amount of tokenOut willing to receive
     * @param data ABI-encoded Hop Swap to be used
     */
    function _swapHop(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes memory data)
        internal
        returns (uint256 amountOut)
    {
        require(data.length == ENCODED_DATA_SWAP_LENGTH, 'HOP_INVALID_DATA_LENGTH');
        address hopSwapAddress = abi.decode(data, (address));

        IHopSwap hopSwap = IHopSwap(hopSwapAddress);
        uint8 tokenInIndex = hopSwap.getTokenIndex(tokenIn);
        uint8 tokenOutIndex = hopSwap.getTokenIndex(tokenOut);

        ERC20Helpers.approve(tokenIn, hopSwapAddress, amountIn);
        return hopSwap.swap(tokenInIndex, tokenOutIndex, amountIn, minAmountOut, block.timestamp);
    }
}
