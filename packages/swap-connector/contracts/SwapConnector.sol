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
import './connectors/UniswapV2Connector.sol';
import './connectors/UniswapV3Connector.sol';
import './connectors/BalancerV2Connector.sol';
import './connectors/ParaswapV5Connector.sol';
import './connectors/OneInchV5Connector.sol';

/**
 * @title SwapConnector
 * @dev Swap Connector implementation that interfaces with Uniswap V2, Uniswap V3, Balancer V2, Paraswap V5,
 * and 1inch V5.
 *
 * It inherits from BaseImplementation which means it's implementation can be used directly from the Mimic Registry,
 * it does not require initialization.
 *
 * IMPORTANT! As many other implementations in this repo, this contract is intended to be used as a LIBRARY, not
 * a contract. Due to limitations of the Solidity compiler, it's not possible to work with immutable variables in
 * libraries yet. Therefore, we are relying on contracts without storage variables so they can be safely
 * delegate-called if desired.
 */
contract SwapConnector is
    ISwapConnector,
    BaseImplementation,
    UniswapV2Connector,
    UniswapV3Connector,
    BalancerV2Connector,
    ParaswapV5Connector,
    OneInchV5Connector
{
    // Namespace under which the Swap Connector is registered in the Mimic Registry
    bytes32 public constant override NAMESPACE = keccak256('SWAP_CONNECTOR');

    /**
     * @dev Initializes the SwapConnector contract
     * @param uniswapV2Router Uniswap V2 router reference
     * @param uniswapV3Router Uniswap V3 router reference
     * @param balancerV2Vault Balancer V2 vault reference
     * @param paraswapV5Augustus Paraswap V5 augustus reference
     * @param registry Address of the Mimic Registry
     */
    constructor(
        address uniswapV2Router,
        address uniswapV3Router,
        address balancerV2Vault,
        address paraswapV5Augustus,
        address oneInchV5Router,
        address registry
    )
        UniswapV2Connector(uniswapV2Router)
        UniswapV3Connector(uniswapV3Router)
        BalancerV2Connector(balancerV2Vault)
        ParaswapV5Connector(paraswapV5Augustus)
        OneInchV5Connector(oneInchV5Router)
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
        uint8 source,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) external override returns (uint256 amountOut) {
        Source s = Source(source);
        if (s == Source.UniswapV2) return _swapUniswapV2(tokenIn, tokenOut, amountIn, minAmountOut, data);
        else if (s == Source.UniswapV3) return _swapUniswapV3(tokenIn, tokenOut, amountIn, minAmountOut, data);
        else if (s == Source.BalancerV2) return _swapBalancerV2(tokenIn, tokenOut, amountIn, minAmountOut, data);
        else if (s == Source.ParaswapV5) return _swapParaswapV5(tokenIn, tokenOut, amountIn, minAmountOut, data);
        else if (s == Source.OneInchV5) return _swapOneInchV5(tokenIn, tokenOut, amountIn, minAmountOut, data);
        else revert('INVALID_SOURCE');
    }
}
