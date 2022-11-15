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

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import '@uniswap/v3-periphery/contracts/interfaces/IPeripheryImmutableState.sol';

import '@mimic-fi/v2-helpers/contracts/utils/Arrays.sol';
import '@mimic-fi/v2-helpers/contracts/utils/Bytes.sol';
import '@mimic-fi/v2-helpers/contracts/math/UncheckedMath.sol';

/**
 * @title UniswapV3Connector
 * @dev Interfaces with Uniswap V3 to swap tokens
 */
contract UniswapV3Connector {
    using Bytes for bytes;
    using SafeERC20 for IERC20;
    using UncheckedMath for uint256;

    // Expected data length for Uniswap V3 single swaps: fee
    uint256 private constant ENCODED_DATA_SINGLE_SWAP_LENGTH = 32;

    // Reference to UniswapV3 router
    ISwapRouter private immutable uniswapV3Router;

    /**
     * @dev Initializes the UniswapV3Connector contract
     * @param _uniswapV3Router Uniswap V3 router reference
     */
    constructor(address _uniswapV3Router) {
        uniswapV3Router = ISwapRouter(_uniswapV3Router);
    }

    /**
     * @dev Internal function to swap two tokens through UniswapV3
     * @param tokenIn Token being sent
     * @param tokenOut Token being received
     * @param amountIn Amount of tokenIn being swapped
     * @param minAmountOut Minimum amount of tokenOut willing to receive
     * @param data ABI-encoded-packed specifying the list of hop-tokens and fees to use
     */
    function _swapUniswapV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) internal returns (uint256 amountOut) {
        IERC20(tokenIn).safeApprove(address(uniswapV3Router), amountIn);
        return
            data.length == ENCODED_DATA_SINGLE_SWAP_LENGTH
                ? _singleSwapUniswapV3(tokenIn, tokenOut, amountIn, minAmountOut, data)
                : _batchSwapUniswapV3(tokenIn, tokenOut, amountIn, minAmountOut, data);
    }

    /**
     * @dev Internal function to swap two tokens through UniswapV3 using a single hop
     * @param tokenIn Token being sent
     * @param tokenOut Token being received
     * @param amountIn Amount of tokenIn being swapped
     * @param minAmountOut Minimum amount of tokenOut willing to receive
     * @param data ABI-encoded-packed of the uint24 fee to be used
     */
    function _singleSwapUniswapV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) private returns (uint256 amountOut) {
        uint24 fee = abi.decode(data, (uint24));
        _validatePool(_uniswapV3Factory(), tokenIn, tokenOut, fee);

        ISwapRouter.ExactInputSingleParams memory input;
        input.tokenIn = tokenIn;
        input.tokenOut = tokenOut;
        input.fee = fee;
        input.recipient = address(this);
        input.deadline = block.timestamp;
        input.amountIn = amountIn;
        input.amountOutMinimum = minAmountOut;
        input.sqrtPriceLimitX96 = 0;
        return uniswapV3Router.exactInputSingle(input);
    }

    /**
     * @dev Internal function to swap two tokens through UniswapV3 using a multi hop
     * @param tokenIn Token being sent
     * @param tokenOut Token being received
     * @param amountIn Amount of the first token in the path to be swapped
     * @param minAmountOut Minimum amount of the last token in the path willing to receive
     * @param data ABI-encoded-packed list of hop-tokens between tokenIn and tokenOut and list of fees to be used
     */
    function _batchSwapUniswapV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) private returns (uint256 amountOut) {
        (address[] memory hopTokens, uint24[] memory fees) = abi.decode(data, (address[], uint24[]));
        // No need for checked math since we are simply adding one to a memory array's length
        require(fees.length == hopTokens.length.uncheckedAdd(1), 'INVALID_UNISWAP_V3_INPUT_LENGTH');

        address factory = _uniswapV3Factory();
        address[] memory tokens = Arrays.from(tokenIn, hopTokens, tokenOut);
        // No need for checked math since we are using it to compute indexes manually, always within boundaries
        for (uint256 i = 0; i < fees.length; i = i.uncheckedAdd(1)) {
            _validatePool(factory, tokens[i], tokens[i.uncheckedAdd(1)], fees[i]);
        }

        ISwapRouter.ExactInputParams memory input;
        input.path = _encodePoolPath(tokens, fees);
        input.amountIn = amountIn;
        input.amountOutMinimum = minAmountOut;
        input.recipient = address(this);
        input.deadline = block.timestamp;
        return uniswapV3Router.exactInput(input);
    }

    /**
     * @dev Internal function to fetch the Uniswap V3 factory contract address
     * @return Address of the Uniswap V3 factory contract
     */
    function _uniswapV3Factory() private view returns (address) {
        return IPeripheryImmutableState(address(uniswapV3Router)).factory();
    }

    /**
     * @dev Internal function to validate that there is a pool created for tokenA and tokenB with a requested fee
     * @param factory UniswapV3 factory to check against
     * @param tokenA One of the tokens in the pool
     * @param tokenB The other token in the pool
     * @param fee Fee used by the pool
     */
    function _validatePool(address factory, address tokenA, address tokenB, uint24 fee) private view {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(IUniswapV3Factory(factory).getPool(token0, token1, fee) != address(0), 'INVALID_UNISWAP_POOL_FEE');
    }

    /**
     * @dev Internal function to encode a path of tokens with their corresponding fees
     * @param tokens List of tokens to be encoded
     * @param fees List of fees to use for each token pair
     */
    function _encodePoolPath(address[] memory tokens, uint24[] memory fees) private pure returns (bytes memory path) {
        path = new bytes(0);
        for (uint256 i = 0; i < fees.length; i = i.uncheckedAdd(1)) path = path.concat(tokens[i]).concat(fees[i]);
        path = path.concat(tokens[fees.length]);
    }
}
