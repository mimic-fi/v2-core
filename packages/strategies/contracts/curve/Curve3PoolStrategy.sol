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

/**
 * @title Curve3PoolStrategy
 * @dev TODO
 */
contract Curve3PoolStrategy is IStrategy, BaseImplementation {
    using FixedPoint for uint256;

    // Namespace under which the Strategies implementations are registered in the Mimic Registry
    bytes32 public constant override NAMESPACE = keccak256('STRATEGY');

    // Curve 3 pool uses 3 tokens
    uint256 public constant COINS = 3;

    // Curve 3 pool uses 1 reward token
    uint256 public constant REWARDS = 1;

    // Token that will be used as the strategy entry point
    address public immutable override token;

    // LP token used by the Curve pool
    IERC20 public poolToken;

    // Address of the CRV token used as the reward token of the gauge
    IERC20 public crv;

    // Curve pool
    ICurve3Pool public immutable pool;

    // Curve pool liquidity gauge
    ICurveLiquidityGauge public immutable gauge;

    // Index of the token entry point in the given Curve pool
    uint256 public immutable tokenIndex;

    // Value to scale token strategy amounts to 18 decimals
    uint256 public immutable tokenScale;

    /**
     * @dev Creates a new Curve strategy contract
     * @param _token Token to be used as the strategy entry point
     * @param _poolToken LP token used by the associated Curve pool
     * @param _pool Curve pool associated to the strategy
     * @param _registry Address of the Mimic Registry to be referenced
     */
    constructor(address _token, IERC20 _poolToken, ICurve3Pool _pool, ICurveLiquidityGauge _gauge, address _registry)
        BaseImplementation(_registry)
    {
        require(_gauge.lp_token() == address(_poolToken), 'CURVE_INVALID_POOL_TOKEN');

        token = _token;
        poolToken = _poolToken;
        crv = IERC20(_gauge.crv_token());
        pool = _pool;
        gauge = _gauge;

        uint256 index = COINS;
        for (uint256 i = 0; i < COINS; i++) if (_pool.coins(i) == _token) index = i;
        require(index < COINS, 'CURVE_COIN_NOT_FOUND');
        tokenIndex = index;

        uint256 decimals = IERC20Metadata(_token).decimals();
        require(decimals <= 18, 'CURVE_TOKEN_ABOVE_18_DECIMALS');
        tokenScale = 10**(18 - decimals);
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

        amounts = new uint256[](REWARDS);
        amounts[0] = finalCrvAmount - initialCrvAmount;

        tokens = new address[](REWARDS);
        tokens[0] = address(crv);
    }

    /**
     * @dev Join the associated Curve pool
     * @param amount Amount of strategy tokens to invest
     * @param slippage Slippage value to be used to compute the desired min amount out of pool tokens
     * @return value Value represented by the joined amount
     */
    function join(uint256 amount, uint256 slippage, bytes memory) external override returns (uint256 value) {
        if (amount == 0) return 0;
        require(slippage <= FixedPoint.ONE, 'CURVE_INVALID_SLIPPAGE');

        // Compute min amount out of pool tokens
        uint256 poolTokenPrice = pool.get_virtual_price();
        uint256 expectedAmountOut = (amount * tokenScale).divUp(poolTokenPrice);
        uint256 minAmountOut = expectedAmountOut.mulUp(FixedPoint.ONE - slippage);
        uint256[COINS] memory amounts;
        amounts[tokenIndex] = amount;

        // Join pool
        uint256 initialPoolTokenBalance = poolToken.balanceOf(address(this));
        IERC20(token).approve(address(pool), amount);
        pool.add_liquidity(amounts, minAmountOut);
        uint256 finalPoolTokenBalance = poolToken.balanceOf(address(this));
        value = finalPoolTokenBalance - initialPoolTokenBalance;

        // Stake pool tokens
        poolToken.approve(address(gauge), value);
        gauge.deposit(value);
    }

    /**
     * @dev Exit from the associated Curve pool
     * @param ratio Ratio of the invested position to divest
     * @param slippage Slippage value to be used to compute the desired min amount out of strategy tokens
     * @return amount Amount of strategy tokens exited with
     * @return value Value represented by the exited amount
     */
    function exit(uint256 ratio, uint256 slippage, bytes memory)
        external
        override
        returns (uint256 amount, uint256 value)
    {
        if (ratio == 0) return (0, 0);
        require(ratio <= FixedPoint.ONE, 'CURVE_INVALID_RATIO');
        require(slippage <= FixedPoint.ONE, 'CURVE_INVALID_SLIPPAGE');

        // Unstake pool tokens
        uint256 stakedPoolTokenBalance = gauge.balanceOf(address(this));
        uint256 exitPoolTokenAmount = stakedPoolTokenBalance.mulDown(ratio);
        gauge.withdraw(exitPoolTokenAmount);

        // Compute min amount out of strategy tokens
        uint256 poolTokenPrice = pool.get_virtual_price();
        uint256 expectedAmountOut = exitPoolTokenAmount.mulUp(poolTokenPrice) / tokenScale;
        uint256 minAmountOut = expectedAmountOut.mulUp(FixedPoint.ONE - slippage);

        // Exit pool
        uint256 initialTokenAmount = IERC20(token).balanceOf(address(this));
        pool.remove_liquidity_one_coin(exitPoolTokenAmount, int128(int256(tokenIndex)), minAmountOut);
        uint256 finalTokenAmount = IERC20(token).balanceOf(address(this));
        amount = finalTokenAmount - initialTokenAmount;
        value = exitPoolTokenAmount.mulDown(poolTokenPrice);
    }
}
