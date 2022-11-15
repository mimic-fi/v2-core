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
import '@openzeppelin/contracts/utils/math/SafeCast.sol';

import '@mimic-fi/v2-helpers/contracts/utils/Arrays.sol';
import '@mimic-fi/v2-helpers/contracts/math/UncheckedMath.sol';

import '../interfaces/IBalancerV2Vault.sol';

/**
 * @title BalancerV2Connector
 * @dev Interfaces with Balancer V2 to swap tokens
 */
contract BalancerV2Connector {
    using Arrays for address[];
    using SafeERC20 for IERC20;
    using UncheckedMath for int256;
    using UncheckedMath for uint256;

    // Expected data length for Balancer V2 single swaps: pool ID
    uint256 private constant ENCODED_DATA_SINGLE_SWAP_LENGTH = 32;

    // Reference to BalancerV2 vault
    IBalancerV2Vault private immutable balancerV2Vault;

    /**
     * @dev Initializes the BalancerV2Connector contract
     * @param _balancerV2Vault Balancer V2 vault reference
     */
    constructor(address _balancerV2Vault) {
        balancerV2Vault = IBalancerV2Vault(_balancerV2Vault);
    }

    /**
     * @dev Internal function to swap two tokens through BalancerV2
     * @param tokenIn Token being sent
     * @param tokenOut Token being received
     * @param amountIn Amount of tokenIn being swapped
     * @param minAmountOut Minimum amount of tokenOut willing to receive
     * @param data ABI-encoded-packed specifying the list of hop-tokens and pool IDs to use
     */
    function _swapBalancerV2(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) internal returns (uint256 amountOut) {
        IERC20(tokenIn).safeApprove(address(balancerV2Vault), amountIn);
        return
            data.length == ENCODED_DATA_SINGLE_SWAP_LENGTH
                ? _singleSwapBalancerV2(tokenIn, tokenOut, amountIn, minAmountOut, data)
                : _batchSwapBalancerV2(tokenIn, tokenOut, amountIn, minAmountOut, data);
    }

    /**
     * @dev Internal function to swap two tokens through BalancerV2 using a single hop
     * @param tokenIn Token being sent
     * @param tokenOut Token being received
     * @param amountIn Amount of tokenIn being swapped
     * @param minAmountOut Minimum amount of tokenOut willing to receive
     * @param data ABI-encoded-packed to specify the pool ID to be used
     */
    function _singleSwapBalancerV2(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) private returns (uint256 amountOut) {
        bytes32 poolId = abi.decode(data, (bytes32));
        _validatePool(poolId, tokenIn, tokenOut);

        IBalancerV2Vault.SingleSwap memory swap;
        swap.poolId = poolId;
        swap.kind = IBalancerV2Vault.SwapKind.GIVEN_IN;
        swap.assetIn = tokenIn;
        swap.assetOut = tokenOut;
        swap.amount = amountIn;
        swap.userData = new bytes(0);
        return balancerV2Vault.swap(swap, _fundManagement(), minAmountOut, block.timestamp);
    }

    /**
     * @dev Internal function to swap two tokens through BalancerV2 using a multi hop
     * @param tokenIn Token being sent
     * @param tokenOut Token being received
     * @param amountIn Amount of tokenIn to be swapped
     * @param minAmountOut Minimum amount of tokenOut willing to receive
     * @param data ABI-encoded-packed to specify the list of hop-tokens and pool IDs between tokenIn and tokenOut
     */
    function _batchSwapBalancerV2(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) private returns (uint256 amountOut) {
        // Decode data and validate pools
        (address[] memory hopTokens, bytes32[] memory poolIds) = abi.decode(data, (address[], bytes32[]));
        // No need for checked math since we are simply adding one to a memory array's length
        require(poolIds.length == hopTokens.length.uncheckedAdd(1), 'INVALID_BALANCER_V2_INPUT_LENGTH');

        address[] memory tokens = Arrays.from(tokenIn, hopTokens, tokenOut);
        // No need for checked math since we are using it to compute indexes manually, always within boundaries
        for (uint256 i = 0; i < poolIds.length; i = i.uncheckedAdd(1)) {
            _validatePool(poolIds[i], tokens[i], tokens[i.uncheckedAdd(1)]);
        }

        // Build list of swap steps
        // No need for checked math as we know we are operating safely within boundaries
        uint256 steps = tokens.length.uncheckedSub(1);
        IBalancerV2Vault.BatchSwapStep[] memory swaps = new IBalancerV2Vault.BatchSwapStep[](steps);
        for (uint256 j = 0; j < steps; j = j.uncheckedAdd(1)) {
            IBalancerV2Vault.BatchSwapStep memory swap = swaps[j];
            swap.amount = j == 0 ? amountIn : 0;
            swap.poolId = poolIds[j];
            swap.assetInIndex = j;
            swap.assetOutIndex = j.uncheckedAdd(1);
            swap.userData = new bytes(0);
        }

        // Build limits values
        int256[] memory limits = new int256[](tokens.length);
        limits[0] = SafeCast.toInt256(amountIn);
        // No need for checked math as we know we are operating safely within boundaries
        limits[limits.length.uncheckedSub(1)] = SafeCast.toInt256(minAmountOut).uncheckedMul(-1);

        // Swap
        int256[] memory results = balancerV2Vault.batchSwap(
            IBalancerV2Vault.SwapKind.GIVEN_IN,
            swaps,
            tokens,
            _fundManagement(),
            limits,
            block.timestamp
        );

        // Validate output
        // No need for checked math as we know we are operating safely within boundaries
        int256 intAmountOut = results[results.length.uncheckedSub(1)];
        require(intAmountOut < 0, 'BALANCER_INVALID_BATCH_AMOUNT_OU');
        require(SafeCast.toUint256(results[0]) == amountIn, 'BALANCER_INVALID_BATCH_AMOUNT_IN');
        // No need for checked math as we already checked it is a negative value
        return uint256(intAmountOut.uncheckedMul(-1));
    }

    /**
     * @dev Internal function to build the fund management struct required by Balancer for swaps
     */
    function _fundManagement() private view returns (IBalancerV2Vault.FundManagement memory) {
        return
            IBalancerV2Vault.FundManagement({
                sender: address(this),
                fromInternalBalance: false,
                recipient: payable(address(this)),
                toInternalBalance: false
            });
    }

    /**
     * @dev Internal function to validate that there is a pool created for tokenA and tokenB with a requested pool ID
     * @param poolId Balancer pool ID
     * @param tokenA One of the tokens in the pool
     * @param tokenB The other token in the pool
     */
    function _validatePool(bytes32 poolId, address tokenA, address tokenB) private view {
        (address pool, ) = balancerV2Vault.getPool(poolId);
        require(pool != address(0), 'INVALID_BALANCER_POOL_ID');
        (address[] memory tokens, , ) = balancerV2Vault.getPoolTokens(poolId);
        require(tokens.includes(tokenA, tokenB), 'INVALID_BALANCER_POOL_TOKENS');
    }
}
