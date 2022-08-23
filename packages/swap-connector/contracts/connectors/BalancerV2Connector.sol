// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/SafeCast.sol';

import '../interfaces/IBalancerV2Vault.sol';

import '../utils/Arrays.sol';
import '../utils/Bytes.sol';

/**
 * @title BalancerV2Connector
 * @dev Interfaces with Balancer V2 to swap tokens
 */
contract BalancerV2Connector {
    using Arrays for address[];
    using Arrays for bytes32[];
    using SafeERC20 for IERC20;

    // Expected data length for Balancer V2 single swaps: only for the pool ID + enum (bytes32 + uint8)
    uint256 private constant ENCODED_DATA_SINGLE_SWAP_LENGTH = 64;

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
        (, bytes32 poolId) = abi.decode(data, (uint8, bytes32));
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
        (, address[] memory hopTokens, bytes32[] memory poolIds) = abi.decode(data, (uint8, address[], bytes32[]));
        require(poolIds.length == hopTokens.length + 1, 'INVALID_BALANCER_V2_INPUT_LENGTH');
        address[] memory tokens = Arrays.from(tokenIn, hopTokens, tokenOut);
        for (uint256 i = 0; i < poolIds.length; i++) _validatePool(poolIds[i], tokens[i], tokens[i + 1]);

        // Build list of swap steps
        uint256 steps = tokens.length - 1;
        IBalancerV2Vault.BatchSwapStep[] memory swaps = new IBalancerV2Vault.BatchSwapStep[](steps);
        for (uint256 j = 0; j < steps; j++) {
            IBalancerV2Vault.BatchSwapStep memory swap = swaps[j];
            swap.amount = j == 0 ? amountIn : 0;
            swap.poolId = poolIds[j];
            swap.assetInIndex = j;
            swap.assetOutIndex = j + 1;
            swap.userData = new bytes(0);
        }

        // Build limits values
        int256[] memory limits = new int256[](tokens.length);
        limits[0] = SafeCast.toInt256(amountIn);
        limits[limits.length - 1] = -SafeCast.toInt256(minAmountOut);

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
        int256 intAmountOut = results[results.length - 1];
        require(intAmountOut < 0, 'BALANCER_INVALID_BATCH_AMOUNT_OU');
        require(SafeCast.toUint256(results[0]) == amountIn, 'BALANCER_INVALID_BATCH_AMOUNT_IN');
        return uint256(-intAmountOut);
    }

    /**
     * @dev Internal function to build the fund management struct required by Balancer for swaps
     */
    function _fundManagement() private view returns (IBalancerV2Vault.FundManagement memory) {
        return
            IBalancerV2Vault.FundManagement({
                sender: address(this),
                fromInternalBalance: false,
                recipient: payable(msg.sender),
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
