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

import './ISwapConnector.sol';
import './connectors/UniswapV3Connector.sol';
import './connectors/UniswapV2Connector.sol';
import './connectors/BalancerV2Connector.sol';

/**
 * @title SwapConnector
 * @dev This is a pre-set DEX aggregator. Currently, it interfaces with Uniswap V2, Uniswap V3, and Balancer V2.
 *      Exchange paths can be pre-set to tell the swap connector which DEX must be used. These paths can bet set/unset
 *      at any time, and Uniswap V2 is being used by default.
 */
contract SwapConnector is ISwapConnector, UniswapV3Connector, UniswapV2Connector, BalancerV2Connector {
    bytes32 public constant NAMESPACE = keccak256('SWAP_CONNECTOR');

    /**
     * @dev Initializes the SwapConnector contract
     * @param uniswapV3Router Uniswap V3 router reference
     * @param uniswapV2Router Uniswap V2 router reference
     * @param balancerV2Vault Balancer V2 vault reference
     */
    constructor(address uniswapV3Router, address uniswapV2Router, address balancerV2Vault)
        UniswapV3Connector(uniswapV3Router)
        UniswapV2Connector(uniswapV2Router)
        BalancerV2Connector(balancerV2Vault)
    {
        // solhint-disable-previous-line no-empty-blocks
    }

    /**
     * @dev Swaps two tokens
     * @param tokenIn Token being sent
     * @param tokenOut Token being received
     * @param amountIn Amount of tokenIn being swapped
     * @param minAmountOut Minimum amount of tokenOut willing to receive
     * @param data Extra data to be parsed based on the DEX requested
     */
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes memory data)
        external
        override
        returns (uint256 amountOut)
    {
        DEX dex = abi.decode(data, (DEX));
        amountOut = _swap(dex, tokenIn, tokenOut, amountIn, minAmountOut, data);
    }

    /**
     * @dev Internal function to swaps two tokens. It will dispatch the request to the corresponding DEX set.
     */
    function _swap(
        DEX dex,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) internal returns (uint256) {
        if (dex == DEX.UniswapV2) return _swapUniswapV2(tokenIn, tokenOut, amountIn, minAmountOut, data);
        else if (dex == DEX.UniswapV3) return _swapUniswapV3(tokenIn, tokenOut, amountIn, minAmountOut, data);
        else if (dex == DEX.BalancerV2) return _swapBalancerV2(tokenIn, tokenOut, amountIn, minAmountOut, data);
        else revert('INVALID_DEX_OPTION');
    }
}
