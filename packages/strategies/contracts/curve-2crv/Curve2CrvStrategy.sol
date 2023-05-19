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

import '@mimic-fi/v2-helpers/contracts/math/FixedPoint.sol';
import '@mimic-fi/v2-registry/contracts/implementations/BaseImplementation.sol';

import './I2CrvPool.sol';
import './ICvxPool.sol';
import './ICvxBooster.sol';
import '../IStrategy.sol';

/**
 * @title Curve2CrvStrategy
 */
contract Curve2CrvStrategy is IStrategy, BaseImplementation {
    using FixedPoint for uint256;

    // Namespace under which the Strategies implementations are registered in the Mimic Registry
    bytes32 public constant override NAMESPACE = keccak256('STRATEGY');

    // Underlying token that will be used to add liquidity to the 2CRV pool
    IERC20 public immutable token;

    // 2CRV pool address
    I2CrvPool public immutable pool;

    // Convex pool token
    ICvxPool public immutable cvxPool;

    // CRV token
    IERC20 public immutable crv;

    // Convex booster
    ICvxBooster public immutable booster;

    // ID of the rewards pool in the Convex
    uint256 public immutable poolId;

    // Index of the underlying token in the 2CRV pool
    uint256 public immutable tokenIndex;

    // Value to scale token amounts to 18 decimals
    uint256 public immutable tokenScale;

    /**
     * @dev Creates a new 2CRV strategy
     */
    constructor(I2CrvPool _pool, IERC20 _token, ICvxBooster _booster, address _registry) BaseImplementation(_registry) {
        pool = _pool;
        token = _token;
        booster = _booster;

        tokenIndex = _findTokenIndex(_pool, _token);
        (poolId, cvxPool, crv) = _findCvxPoolInfo(_booster, _pool);

        uint256 decimals = IERC20Metadata(address(_token)).decimals();
        require(decimals <= 18, '2CRV_TOKEN_ABOVE_18_DECIMALS');
        tokenScale = 10**(18 - decimals);
    }

    /**
     * @dev Tokens accepted to join the strategy
     */
    function joinTokens() public view override returns (address[] memory tokens) {
        tokens = new address[](1);
        tokens[0] = address(token);
    }

    /**
     * @dev Tokens accepted to exit the strategy
     */
    function exitTokens() public view override returns (address[] memory tokens) {
        tokens = new address[](1);
        tokens[0] = address(cvxPool);
    }

    /**
     * @dev Tells how much a value unit means expressed in the strategy token.
     * For example, if a strategy has a value of 100 in T0, and then it has a value of 120 in T1,
     * and the value rate is 1.5, it means the strategy has earned 30 strategy tokens between T0 and T1.
     */
    function valueRate() external pure override returns (uint256) {
        return FixedPoint.ONE;
    }

    /**
     * @dev Tells how much value the strategy has over time.
     * For example, if a strategy has a value of 100 in T0, and then it has a value of 120 in T1,
     * It means it gained a 20% between T0 and T1 due to the earned swap fees and liquidity mining rewards.
     * Note: This function only tells the total value until the last claim
     */
    function lastValue(address account) public view override returns (uint256) {
        uint256 poolTokenPrice = pool.get_virtual_price();
        uint256 cvxPoolBalance = cvxPool.balanceOf(account);
        return cvxPoolBalance.mulDown(poolTokenPrice);
    }

    /**
     * @dev Claims CVX pool rewards
     * @param data No extra data, must be empty
     */
    function claim(bytes memory data) external override returns (address[] memory tokens, uint256[] memory amounts) {
        require(data.length == 0, '2CRV_INVALID_EXTRA_DATA_LENGTH');

        uint256 initialCrvBalance = crv.balanceOf(address(this));
        cvxPool.getReward(address(this));
        uint256 finalCrvBalance = crv.balanceOf(address(this));

        amounts = new uint256[](1);
        amounts[0] = finalCrvBalance - initialCrvBalance;

        tokens = new address[](1);
        tokens[0] = address(crv);
    }

    /**
     * @dev Add liquidity to 2CRV pool and deposit LP tokens in Convex
     * @param tokensIn List of tokens the strategy should use to join, must match output from `joinTokens`
     * @param amountsIn List of amounts the strategy should use to join for each token in
     * @param slippage Slippage value to be used to compute the desired min amount out of pool tokens
     */
    function join(address[] memory tokensIn, uint256[] memory amountsIn, uint256 slippage, bytes memory data)
        external
        override
        returns (address[] memory tokensOut, uint256[] memory amountsOut, uint256 value)
    {
        require(tokensIn.length == 1, '2CRV_INVALID_TOKENS_IN_LENGTH');
        require(amountsIn.length == 1, '2CRV_INVALID_AMOUNTS_IN_LENGTH');
        require(tokensIn[0] == address(token), '2CRV_INVALID_JOIN_TOKEN');
        require(slippage <= FixedPoint.ONE, '2CRV_INVALID_SLIPPAGE');
        require(data.length == 0, '2CRV_INVALID_EXTRA_DATA_LENGTH');

        tokensOut = exitTokens();
        amountsOut = new uint256[](1);
        if (amountsIn[0] == 0) return (tokensOut, amountsOut, 0);

        // Compute min amount out
        uint256 poolTokenPrice = pool.get_virtual_price();
        uint256 expectedAmountOut = (amountsIn[0] * tokenScale).divUp(poolTokenPrice);
        uint256 minAmountOut = expectedAmountOut.mulUp(FixedPoint.ONE - slippage);

        // Join pool
        uint256[2] memory amounts;
        amounts[tokenIndex] = amountsIn[0];
        uint256 initialPoolTokenBalance = pool.balanceOf(address(this));
        token.approve(address(pool), amountsIn[0]);
        pool.add_liquidity(amounts, minAmountOut);
        uint256 finalPoolTokenBalance = pool.balanceOf(address(this));
        uint256 poolTokenBalance = finalPoolTokenBalance - initialPoolTokenBalance;

        // Stake in Convex
        uint256 initialCvxPoolTokenBalance = cvxPool.balanceOf(address(this));
        pool.approve(address(booster), poolTokenBalance);
        require(booster.deposit(poolId, poolTokenBalance), '2CRV_BOOSTER_DEPOSIT_FAILED');
        uint256 finalCvxPoolTokenBalance = cvxPool.balanceOf(address(this));
        uint256 cvxPoolTokenBalance = finalCvxPoolTokenBalance - initialCvxPoolTokenBalance;

        // Compute value
        value = poolTokenBalance.mulDown(poolTokenPrice);
        amountsOut[0] = cvxPoolTokenBalance;
    }

    /**
     * @dev Withdraw LP tokens from Convex and remove liquidity from 2CRV pool
     * @param tokensIn List of tokens the strategy should use to exit, must match output from `exitTokens`
     * @param amountsIn List of amounts the strategy should use to exit for each token in
     * @param slippage Slippage value to be used to compute the desired min amount out of strategy tokens
     */
    function exit(address[] memory tokensIn, uint256[] memory amountsIn, uint256 slippage, bytes memory data)
        external
        override
        returns (address[] memory tokensOut, uint256[] memory amountsOut, uint256 value)
    {
        require(tokensIn.length == 1, '2CRV_INVALID_TOKENS_IN_LENGTH');
        require(amountsIn.length == 1, '2CRV_INVALID_AMOUNTS_IN_LENGTH');
        require(tokensIn[0] == address(cvxPool), '2CRV_INVALID_EXIT_TOKEN');
        require(slippage <= FixedPoint.ONE, '2CRV_INVALID_SLIPPAGE');
        require(data.length == 0, '2CRV_INVALID_EXTRA_DATA_LENGTH');

        tokensOut = joinTokens();
        amountsOut = new uint256[](1);
        if (amountsIn[0] == 0) return (tokensOut, amountsOut, 0);

        // Unstake from Convex
        uint256 initialPoolTokenBalance = pool.balanceOf(address(this));
        require(cvxPool.withdraw(amountsIn[0], true), '2CRV_CVX_POOL_WITHDRAW_FAILED');
        uint256 finalPoolTokenBalance = pool.balanceOf(address(this));
        uint256 poolTokenBalance = finalPoolTokenBalance - initialPoolTokenBalance;

        // Compute min amount out
        uint256 poolTokenPrice = pool.get_virtual_price();
        uint256 expectedAmountOut = poolTokenBalance.mulUp(poolTokenPrice) / tokenScale;
        uint256 minAmountOut = expectedAmountOut.mulUp(FixedPoint.ONE - slippage);

        // Exit pool
        uint256 initialTokenBalance = IERC20(token).balanceOf(address(this));
        pool.remove_liquidity_one_coin(poolTokenBalance, int128(int256(tokenIndex)), minAmountOut);
        uint256 finalTokenBalance = IERC20(token).balanceOf(address(this));
        uint256 tokenBalance = finalTokenBalance - initialTokenBalance;

        // Compute value
        value = poolTokenBalance.mulDown(poolTokenPrice);
        amountsOut[0] = tokenBalance;
    }

    /**
     * @dev Private function to find the index of the strategy entry token in the 2CRV pool
     */
    function _findTokenIndex(I2CrvPool _pool, IERC20 _token) private view returns (uint256) {
        for (uint256 i = 0; true; i++) {
            try _pool.coins(i) returns (address coin) {
                if (address(_token) == coin) return i;
            } catch {
                revert('2CRV_TOKEN_NOT_FOUND');
            }
        }
        revert('2CRV_TOKEN_NOT_FOUND');
    }

    /**
     * @dev Private function to find the Convex pool information for the 2CRV pool
     */
    function _findCvxPoolInfo(ICvxBooster _booster, I2CrvPool _pool) private view returns (uint256, ICvxPool, IERC20) {
        for (uint256 i = 0; i < _booster.poolLength(); i++) {
            (address lp, , address rewards, bool shutdown, ) = _booster.poolInfo(i);
            if (lp == address(_pool) && !shutdown) {
                return (i, ICvxPool(rewards), IERC20(ICvxPool(rewards).crv()));
            }
        }
        revert('2CRV_CVX_POOL_NOT_FOUND');
    }
}
