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

    // Token that will be used as the strategy entry point
    address public immutable override token;

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
    constructor(address _token, IAaveV2Pool _lendingPool, address _registry) BaseImplementation(_registry) {
        IAaveV2Pool.ReserveData memory reserveData = _lendingPool.getReserveData(_token);
        require(reserveData.aTokenAddress != address(0), 'AAVE_V2_MISSING_A_TOKEN');

        token = _token;
        lendingPool = _lendingPool;
        aToken = IAaveV2Token(reserveData.aTokenAddress);
        incentivesController = IAaveV2Token(reserveData.aTokenAddress).getIncentivesController();
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
     * @param amount Amount of strategy tokens to deposit
     * @return value Value represented by the joined amount
     */
    function join(uint256 amount, uint256, bytes memory) external override returns (uint256 value) {
        if (amount == 0) return 0;

        uint256 initialATokenBalance = aToken.balanceOf(address(this));
        IERC20(token).approve(address(lendingPool), amount);
        lendingPool.deposit(address(token), amount, address(this), 0);

        uint256 finalATokenBalance = aToken.balanceOf(address(this));
        value = finalATokenBalance - initialATokenBalance;
    }

    /**
     * @dev Withdraw tokens from the AAVE lending pool
     * @param ratio Ratio of the invested position to withdraw
     * @return amount Amount of strategy tokens exited with
     * @return value Value represented by the exited amount
     */
    function exit(uint256 ratio, uint256, bytes memory) external override returns (uint256 amount, uint256 value) {
        if (ratio == 0) return (0, 0);
        require(ratio <= FixedPoint.ONE, 'AAVE_V2_INVALID_RATIO');

        uint256 initialTokenBalance = IERC20(token).balanceOf(address(this));
        uint256 initialATokenBalance = aToken.balanceOf(address(this));
        uint256 exitATokenAmount = initialATokenBalance.mulDown(ratio);
        lendingPool.withdraw(address(token), exitATokenAmount, address(this));

        uint256 finalTokenBalance = IERC20(token).balanceOf(address(this));
        amount = finalTokenBalance - initialTokenBalance;

        uint256 finalATokenBalance = aToken.balanceOf(address(this));
        value = initialATokenBalance - finalATokenBalance;
    }
}
