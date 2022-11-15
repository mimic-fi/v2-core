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
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';

import '@mimic-fi/v2-helpers/contracts/utils/Arrays.sol';
import '@mimic-fi/v2-helpers/contracts/math/UncheckedMath.sol';

/**
 * @title UniswapV2Connector
 * @dev Interfaces with Uniswap V2 to swap tokens
 */
contract UniswapV2Connector {
    using SafeERC20 for IERC20;
    using UncheckedMath for uint256;

    // Expected data length for Uniswap V2 single swaps: no data expected
    uint256 private constant ENCODED_DATA_SINGLE_SWAP_LENGTH = 0;

    // Reference to UniswapV2 router
    IUniswapV2Router02 private immutable uniswapV2Router;

    /**
     * @dev Initializes the UniswapV2Connector contract
     * @param _uniswapV2Router Uniswap V2 router reference
     */
    constructor(address _uniswapV2Router) {
        uniswapV2Router = IUniswapV2Router02(_uniswapV2Router);
    }

    /**
     * @dev Internal function to swap two tokens through UniswapV2
     * @param tokenIn Token being sent
     * @param tokenOut Token being received
     * @param amountIn Amount of tokenIn being swapped
     * @param minAmountOut Minimum amount of tokenOut willing to receive
     * @param data ABI-encoded list of hop-tokens between tokenIn and tokenOut
     */
    function _swapUniswapV2(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) internal returns (uint256 amountOut) {
        IERC20(tokenIn).safeApprove(address(uniswapV2Router), amountIn);
        uint256[] memory amounts = data.length == ENCODED_DATA_SINGLE_SWAP_LENGTH
            ? _singleSwapUniswapV2(tokenIn, tokenOut, amountIn, minAmountOut)
            : _batchSwapUniswapV2(tokenIn, tokenOut, amountIn, minAmountOut, data);
        return amounts[amounts.length - 1];
    }

    /**
     * @dev Internal function to swap two tokens through UniswapV2 using a single hop
     * @param tokenIn Token being sent
     * @param tokenOut Token being received
     * @param amountIn Amount of tokenIn being swapped
     * @param minAmountOut Minimum amount of tokenOut willing to receive
     */
    function _singleSwapUniswapV2(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut)
        private
        returns (uint256[] memory)
    {
        address factory = uniswapV2Router.factory();
        address[] memory tokens = Arrays.from(tokenIn, tokenOut);
        _validatePool(factory, tokenIn, tokenOut);
        return uniswapV2Router.swapExactTokensForTokens(amountIn, minAmountOut, tokens, address(this), block.timestamp);
    }

    /**
     * @dev Internal function to swap two tokens through UniswapV2 using a multi hop
     * @param tokenIn Token being sent
     * @param tokenOut Token being received
     * @param amountIn Amount of the first token in the path to be swapped
     * @param minAmountOut Minimum amount of the last token in the path willing to receive
     * @param data ABI-encoded-packed list of hop-tokens between tokenIn and tokenOut
     */
    function _batchSwapUniswapV2(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) private returns (uint256[] memory) {
        address factory = uniswapV2Router.factory();
        address[] memory hopTokens = abi.decode(data, (address[]));
        address[] memory tokens = Arrays.from(tokenIn, hopTokens, tokenOut);
        // No need for checked math since we are using it to compute indexes manually, always within boundaries
        for (uint256 i = 0; i < tokens.length.uncheckedSub(1); i = i.uncheckedAdd(1)) {
            _validatePool(factory, tokens[i], tokens[i.uncheckedAdd(1)]);
        }
        return uniswapV2Router.swapExactTokensForTokens(amountIn, minAmountOut, tokens, address(this), block.timestamp);
    }

    /**
     * @dev Internal function to validate that there is a pool created for tokenA and tokenB
     * @param factory UniswapV2 factory to check against
     * @param tokenA First token of the pair
     * @param tokenB Second token of the pair
     */
    function _validatePool(address factory, address tokenA, address tokenB) private view {
        address pool = IUniswapV2Factory(factory).getPair(tokenA, tokenB);
        require(pool != address(0), 'INVALID_UNISWAP_POOL');
    }
}
