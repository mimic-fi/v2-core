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

import '../IStrategy.sol';
import './ICurve3Pool.sol';
import './ICurveLiquidityGauge.sol';

import 'hardhat/console.sol';

/**
 * @title Curve3PoolStrategy
 * @dev TODO
 */
contract Curve3PoolStrategy is IStrategy, BaseImplementation {
    using FixedPoint for uint256;

    // Namespace under which the Strategies implementations are registered in the Mimic Registry
    bytes32 public constant override NAMESPACE = keccak256('STRATEGY');

    // Curve 3 pool uses 3 underlying tokens
    uint256 public constant UNDERLYING_TOKENS_LENGTH = 3;

    // Curve 3 pool uses 1 pool token
    uint256 public constant POOL_TOKENS_LENGTH = 1;

    // Curve 3 pool uses 1 reward token
    uint256 public constant REWARDS_LENGTH = 1;

    // Underlying tokens that will be used as the strategy entry point
    IERC20 public immutable token0;
    IERC20 public immutable token1;
    IERC20 public immutable token2;

    // Value to scale token amounts to 18 decimals for each of the underlying tokens
    uint256 public immutable tokenScale0;
    uint256 public immutable tokenScale1;
    uint256 public immutable tokenScale2;

    // Address of the CRV token used as the reward token of the gauge
    IERC20 public immutable crv;

    // LP token used by the Curve pool
    IERC20 public immutable poolToken;

    // Curve pool
    ICurve3Pool public immutable pool;

    // Curve pool liquidity gauge
    ICurveLiquidityGauge public immutable gauge;

    /**
     * @dev Creates a new Curve strategy contract
     * @param _pool Curve pool associated to the strategy
     * @param _poolToken LP token used by the associated Curve pool
     * @param _registry Address of the Mimic Registry to be referenced
     */
    constructor(ICurve3Pool _pool, IERC20 _poolToken, ICurveLiquidityGauge _gauge, address _registry)
        BaseImplementation(_registry)
    {
        require(_gauge.lp_token() == address(_poolToken), 'CURVE_INVALID_POOL_TOKEN');

        pool = _pool;
        poolToken = _poolToken;
        crv = IERC20(_gauge.crv_token());
        gauge = _gauge;

        address _token0 = _pool.coins(0);
        uint256 decimals0 = IERC20Metadata(_token0).decimals();
        require(decimals0 <= 18, 'CURVE_TOKEN_0_ABOVE_18_DECIMALS');
        tokenScale0 = 10**(18 - decimals0);
        token0 = IERC20(_token0);

        address _token1 = _pool.coins(1);
        uint256 decimals1 = IERC20Metadata(_token1).decimals();
        require(decimals1 <= 18, 'CURVE_TOKEN_1_ABOVE_18_DECIMALS');
        tokenScale1 = 10**(18 - decimals1);
        token1 = IERC20(_token1);

        address _token2 = _pool.coins(2);
        uint256 decimals2 = IERC20Metadata(_token2).decimals();
        require(decimals2 <= 18, 'CURVE_TOKEN_2_ABOVE_18_DECIMALS');
        tokenScale2 = 10**(18 - decimals2);
        token2 = IERC20(_token2);

        bool hasExpectedTokens = false;
        try _pool.coins(UNDERLYING_TOKENS_LENGTH) returns (address) {} catch {
            hasExpectedTokens = true;
        }
        require(hasExpectedTokens, 'CURVE_UNEXPECTED_TOKENS_LENGTH');
    }

    /**
     * @dev TODO
     */
    function joinTokens() public view override returns (address[] memory tokens) {
        tokens = new address[](UNDERLYING_TOKENS_LENGTH);
        tokens[0] = address(token0);
        tokens[1] = address(token1);
        tokens[2] = address(token2);
    }

    /**
     * @dev TODO
     */
    function exitTokens() public view override returns (address[] memory tokens) {
        tokens = new address[](POOL_TOKENS_LENGTH);
        tokens[0] = address(poolToken);
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
        uint256 stakedBalance = gauge.balanceOf(account);
        return stakedBalance.mulDown(pool.get_virtual_price());
    }

    /**
     * @dev Claims Curve rewards
     */
    function claim(bytes memory) external override returns (address[] memory tokens, uint256[] memory amounts) {
        uint256 initialCrvAmount = crv.balanceOf(address(this));
        gauge.minter().mint(address(gauge));
        uint256 finalCrvAmount = crv.balanceOf(address(this));

        amounts = new uint256[](REWARDS_LENGTH);
        amounts[0] = finalCrvAmount - initialCrvAmount;

        tokens = new address[](REWARDS_LENGTH);
        tokens[0] = address(crv);
    }

    /**
     * @dev Join the associated Curve pool
     * @param tokensIn TODO
     * @param amountsIn TODO
     * @param slippage Slippage value to join with
     * @return tokensOut TODO
     * @return amountsOut TODO
     * @return value Value represented by the joined amount
     */
    function join(address[] memory tokensIn, uint256[] memory amountsIn, uint256 slippage, bytes memory)
        external
        override
        returns (address[] memory tokensOut, uint256[] memory amountsOut, uint256 value)
    {
        require(tokensIn.length == UNDERLYING_TOKENS_LENGTH, 'CURVE_INVALID_TOKENS_IN_LENGTH');
        require(amountsIn.length == UNDERLYING_TOKENS_LENGTH, 'CURVE_INVALID_AMOUNTS_IN_LENGTH');
        require(tokensIn[0] == address(token0), 'COMPOUND_INVALID_JOIN_TOKEN_0');
        require(tokensIn[1] == address(token1), 'COMPOUND_INVALID_JOIN_TOKEN_1');
        require(tokensIn[2] == address(token2), 'COMPOUND_INVALID_JOIN_TOKEN_2');
        require(slippage <= FixedPoint.ONE, 'CURVE_INVALID_SLIPPAGE');

        tokensOut = exitTokens();
        amountsOut = new uint256[](POOL_TOKENS_LENGTH);
        uint256 amountIn0 = amountsIn[0];
        uint256 amountIn1 = amountsIn[1];
        uint256 amountIn2 = amountsIn[2];
        if (amountIn0 == 0 && amountIn1 == 0 && amountIn2 == 0) return (tokensOut, amountsOut, 0);

        // Compute min amount out of pool tokens
        uint256 poolTokenPrice = pool.get_virtual_price();
        uint256 scaledAmountIn0 = amountIn0 * tokenScale0;
        uint256 scaledAmountIn1 = amountIn1 * tokenScale1;
        uint256 scaledAmountIn2 = amountIn2 * tokenScale2;
        uint256 expectedAmountOut = (scaledAmountIn0 + scaledAmountIn1 + scaledAmountIn2).divUp(poolTokenPrice);
        uint256 minAmountOut = expectedAmountOut.mulUp(FixedPoint.ONE - slippage);

        // Join pool
        uint256 initialPoolTokenBalance = poolToken.balanceOf(address(this));
        if (amountIn0 > 0) token0.approve(address(pool), amountIn0);
        if (amountIn1 > 0) token1.approve(address(pool), amountIn1);
        if (amountIn2 > 0) token2.approve(address(pool), amountIn2);
        pool.add_liquidity([amountIn0, amountIn1, amountIn2], minAmountOut);

        uint256 finalPoolTokenBalance = poolToken.balanceOf(address(this));
        amountsOut[0] = finalPoolTokenBalance - initialPoolTokenBalance;
        value = amountsOut[0].mulDown(poolTokenPrice);

        // Stake pool tokens
        poolToken.approve(address(gauge), amountsOut[0]);
        gauge.deposit(amountsOut[0]);
    }

    /**
     * @dev Exit from the associated Curve pool
     * @param tokensIn TODO
     * @param amountsIn TODO
     * @param slippage Slippage value to exit with
     * @return tokensOut TODO
     * @return amountsOut TODO
     * @return value Value represented by the exited amount
     */
    function exit(address[] memory tokensIn, uint256[] memory amountsIn, uint256 slippage, bytes memory)
        external
        override
        returns (address[] memory tokensOut, uint256[] memory amountsOut, uint256 value)
    {
        require(tokensIn.length == POOL_TOKENS_LENGTH, 'CURVE_INVALID_TOKENS_IN_LENGTH');
        require(amountsIn.length == POOL_TOKENS_LENGTH, 'CURVE_INVALID_AMOUNTS_IN_LENGTH');
        require(tokensIn[0] == address(poolToken), 'COMPOUND_INVALID_EXIT_TOKEN');
        require(slippage <= FixedPoint.ONE, 'CURVE_INVALID_SLIPPAGE');

        tokensOut = joinTokens();
        amountsOut = new uint256[](1);
        uint256 amountIn = amountsIn[0];
        if (amountIn == 0) return (tokensOut, amountsOut, 0);

        // Unstake pool tokens
        uint256 stakedPoolTokenBalance = gauge.balanceOf(address(this));
        require(amountIn <= stakedPoolTokenBalance, 'CURVE_INSUFFICIENT_STAKED_BALANCE');
        gauge.withdraw(amountIn);

        // Compute min amount out of strategy tokens
        uint256 poolTokenPrice = pool.get_virtual_price();
        uint256 expectedAmountOut0 = amountIn.mulUp(poolTokenPrice) / tokenScale0;
        uint256 expectedAmountOut1 = amountIn.mulUp(poolTokenPrice) / tokenScale1;
        uint256 expectedAmountOut2 = amountIn.mulUp(poolTokenPrice) / tokenScale2;
        uint256[3] memory minAmountsOut;
        minAmountsOut[0] = expectedAmountOut0.mulUp(FixedPoint.ONE - slippage);
        minAmountsOut[1] = expectedAmountOut1.mulUp(FixedPoint.ONE - slippage);
        minAmountsOut[2] = expectedAmountOut2.mulUp(FixedPoint.ONE - slippage);

        // Exit pool
        uint256 initialTokenBalance0 = token0.balanceOf(address(this));
        uint256 initialTokenBalance1 = token1.balanceOf(address(this));
        uint256 initialTokenBalance2 = token2.balanceOf(address(this));
        uint256 initialPoolTokenBalance = poolToken.balanceOf(address(this));
        pool.remove_liquidity(amountIn, minAmountsOut);

        amountsOut[0] = token0.balanceOf(address(this)) - initialTokenBalance0;
        amountsOut[1] = token1.balanceOf(address(this)) - initialTokenBalance1;
        amountsOut[2] = token2.balanceOf(address(this)) - initialTokenBalance2;

        uint256 finalPoolTokenBalance = poolToken.balanceOf(address(this));
        value = (initialPoolTokenBalance - finalPoolTokenBalance).mulDown(poolTokenPrice);
    }
}
