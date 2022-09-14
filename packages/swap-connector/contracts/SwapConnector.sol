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

import '@mimic-fi/v2-registry/contracts/implementations/BaseImplementation.sol';

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
contract SwapConnector is
    ISwapConnector,
    BaseImplementation,
    UniswapV3Connector,
    UniswapV2Connector,
    BalancerV2Connector
{
    bytes32 public constant override NAMESPACE = keccak256('SWAP_CONNECTOR');

    /**
     * @dev Initializes the SwapConnector contract
     * @param uniswapV3Router Uniswap V3 router reference
     * @param uniswapV2Router Uniswap V2 router reference
     * @param balancerV2Vault Balancer V2 vault reference
     */
    constructor(address uniswapV3Router, address uniswapV2Router, address balancerV2Vault, address registry)
        UniswapV3Connector(uniswapV3Router)
        UniswapV2Connector(uniswapV2Router)
        BalancerV2Connector(balancerV2Vault)
        BaseImplementation(registry)
    {
        // solhint-disable-previous-line no-empty-blocks
    }

    /**
     * @dev Swaps two tokens
     * @param source Source to execute the requested swap
     * @param tokenIn Token being sent
     * @param tokenOut Token being received
     * @param amountIn Amount of tokenIn being swapped
     * @param minAmountOut Minimum amount of tokenOut willing to receive
     * @param data Encoded data to specify different swap parameters depending on the source picked
     */
    function swap(
        Source source,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) external override returns (uint256 amountOut) {
        if (source == Source.UniswapV2) return _swapUniswapV2(tokenIn, tokenOut, amountIn, minAmountOut, data);
        else if (source == Source.UniswapV3) return _swapUniswapV3(tokenIn, tokenOut, amountIn, minAmountOut, data);
        else if (source == Source.BalancerV2) return _swapBalancerV2(tokenIn, tokenOut, amountIn, minAmountOut, data);
        else revert('INVALID_DEX_OPTION');
    }
}
