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

import '@mimic-fi/v2-helpers/contracts/math/FixedPoint.sol';
import '@mimic-fi/v2-registry/contracts/implementations/BaseImplementation.sol';

import '../IStrategy.sol';
import './IAaveV2Pool.sol';
import './IAaveV2Token.sol';
import './IAaveV2IncentivesController.sol';

/**
 * @title AaveV2Strategy
 * @dev This strategy invests tokens in AAVE V2 lending pools, obtaining aTokens in exchange to accrue value over time.
 */
contract AaveV2Strategy is IStrategy, BaseImplementation {
    using FixedPoint for uint256;

    // Namespace under which the Strategies implementations are registered in the Mimic Registry
    bytes32 public constant override NAMESPACE = keccak256('STRATEGY');

    // Underlying token that will be used as the strategy entry point
    IERC20 public immutable token;

    // aToken associated to the strategy token
    IAaveV2Token public immutable aToken;

    // AAVE lending pool to invest the strategy tokens
    IAaveV2Pool public immutable lendingPool;

    // AAVE lending pool to invest the strategy tokens
    IAaveV2IncentivesController public immutable incentivesController;

    /**
     * @dev Creates a new AAVE V2 strategy contract
     * @param _token Token to be used as the strategy entry point
     * @param _lendingPool AAVE V2 lending pool to be used
     * @param _registry Address of the Mimic Registry to be referenced
     */
    constructor(IERC20 _token, IAaveV2Pool _lendingPool, address _registry) BaseImplementation(_registry) {
        IAaveV2Pool.ReserveData memory reserveData = _lendingPool.getReserveData(address(_token));
        require(reserveData.aTokenAddress != address(0), 'AAVE_V2_MISSING_A_TOKEN');

        token = _token;
        lendingPool = _lendingPool;
        aToken = IAaveV2Token(reserveData.aTokenAddress);
        incentivesController = IAaveV2Token(reserveData.aTokenAddress).getIncentivesController();
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
        tokens[0] = address(aToken);
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
     * It means it gained a 20% between T0 and T1 due to the appreciation of the aToken and AAVE rewards.
     * @param account Address of the account querying the last value of
     */
    function lastValue(address account) public view override returns (uint256) {
        return aToken.balanceOf(account);
    }

    /**
     * @dev Claims AAVE rewards.
     */
    function claim(bytes memory) external override returns (address[] memory tokens, uint256[] memory amounts) {
        tokens = new address[](1);
        tokens[0] = incentivesController.REWARD_TOKEN();

        address[] memory aTokens = new address[](1);
        aTokens[0] = address(aToken);
        uint256 rewardsBalance = incentivesController.getUserUnclaimedRewards(address(this));

        amounts = new uint256[](1);
        amounts[0] = incentivesController.claimRewards(aTokens, rewardsBalance, address(this));
    }

    /**
     * @dev Deposit tokens in an AAVE lending pool
     * @param tokensIn List of token addresses to join with
     * @param amountsIn List of token amounts to join with
     * @return tokensOut List of token addresses received after the join
     * @return amountsOut List of token amounts received after the join
     * @return value Value represented by the joined amount
     */
    function join(address[] memory tokensIn, uint256[] memory amountsIn, uint256, bytes memory)
        external
        override
        returns (address[] memory tokensOut, uint256[] memory amountsOut, uint256 value)
    {
        require(tokensIn.length == 1, 'AAVE_V2_INVALID_TOKENS_IN_LEN');
        require(amountsIn.length == 1, 'AAVE_V2_INVALID_AMOUNTS_IN_LEN');
        require(tokensIn[0] == address(token), 'AAVE_V2_INVALID_JOIN_TOKEN');

        tokensOut = exitTokens();
        amountsOut = new uint256[](1);
        uint256 amountIn = amountsIn[0];
        if (amountIn == 0) return (tokensOut, amountsOut, 0);

        uint256 initialATokenBalance = aToken.balanceOf(address(this));
        IERC20(token).approve(address(lendingPool), amountIn);
        lendingPool.deposit(address(token), amountIn, address(this), 0);

        uint256 finalATokenBalance = aToken.balanceOf(address(this));
        amountsOut[0] = finalATokenBalance - initialATokenBalance;
        value = amountsOut[0];
    }

    /**
     * @dev Withdraw tokens from the AAVE lending pool
     * @param tokensIn List of token addresses to exit with
     * @param amountsIn List of token amounts to exit with
     * @return tokensOut List of token addresses received after the exit
     * @return amountsOut List of token amounts received after the exit
     * @return value Value represented by the exited amount
     */
    function exit(address[] memory tokensIn, uint256[] memory amountsIn, uint256, bytes memory)
        external
        override
        returns (address[] memory tokensOut, uint256[] memory amountsOut, uint256 value)
    {
        require(tokensIn.length == 1, 'AAVE_V2_INVALID_TOKENS_IN_LEN');
        require(amountsIn.length == 1, 'AAVE_V2_INVALID_AMOUNTS_IN_LEN');
        require(tokensIn[0] == address(aToken), 'AAVE_V2_INVALID_EXIT_TOKEN');

        tokensOut = joinTokens();
        amountsOut = new uint256[](1);
        uint256 amountIn = amountsIn[0];
        if (amountIn == 0) return (tokensOut, amountsOut, 0);

        uint256 initialTokenBalance = token.balanceOf(address(this));
        uint256 initialATokenBalance = aToken.balanceOf(address(this));
        lendingPool.withdraw(address(token), amountIn, address(this));

        uint256 finalTokenBalance = token.balanceOf(address(this));
        amountsOut[0] = finalTokenBalance - initialTokenBalance;

        uint256 finalATokenBalance = aToken.balanceOf(address(this));
        value = initialATokenBalance - finalATokenBalance;
    }
}
