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

import './ICToken.sol';
import './Comptroller.sol';
import '../IStrategy.sol';

/**
 * @title CompoundStrategy
 * @dev This strategy invests tokens in Compound in exchange for a cToken to accrue value and earn COMP over time
 *
 * It inherits from BaseImplementation which means it's implementation can be used directly from the Mimic Registry,
 * it does not require initialization.
 *
 * IMPORTANT! As many other implementations in this repo, this contract is intended to be used as a LIBRARY, not
 * a contract. Due to limitations of the Solidity compiler, it's not possible to work with immutable variables in
 * libraries yet. Therefore, we are relying on contracts without storage variables so they can be safely
 * delegate-called if desired.
 */
contract CompoundStrategy is IStrategy, BaseImplementation {
    using FixedPoint for uint256;

    // Namespace under which the Strategies implementations are registered in the Mimic Registry
    bytes32 public constant override NAMESPACE = keccak256('STRATEGY');

    // Token that will be used as the strategy entry point
    address public immutable override token;

    // Compound token
    IERC20 public immutable comp;

    // cToken associated to the strategy token
    ICToken public immutable cToken;

    // Address of the Compound comptroller
    Comptroller public immutable comptroller;

    /**
     * @dev Creates a new Compound strategy contract
     * @param _cToken Compound token associated to the strategy token
     * @param _registry Address of the Mimic Registry to be referenced
     */
    constructor(ICToken _cToken, address _registry) BaseImplementation(_registry) {
        cToken = _cToken;
        token = _cToken.underlying();
        comp = _cToken.comptroller().getCompAddress();
        comptroller = _cToken.comptroller();
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
     * It means it gained a 20% between T0 and T1 due to the appreciation of the cToken and COMP rewards.
     * Note: This function only tells the total value until the last claim
     */
    function lastValue(address account) public view override returns (uint256) {
        uint256 cTokenRate = cToken.exchangeRateStored();
        uint256 cTokenBalance = cToken.balanceOf(account);
        return cTokenBalance.mulDown(cTokenRate);
    }

    /**
     * @dev Claims Compound rewards
     */
    function claim(bytes memory) external override returns (address[] memory tokens, uint256[] memory amounts) {
        uint256 initialCompBalance = comp.balanceOf(address(this));
        address[] memory cTokens = new address[](1);
        cTokens[0] = address(cToken);
        comptroller.claimComp(address(this), cTokens);
        uint256 finalCompBalance = comp.balanceOf(address(this));

        tokens = new address[](1);
        tokens[0] = address(comp);
        amounts = new uint256[](1);
        amounts[0] = finalCompBalance - initialCompBalance;
    }

    /**
     * @dev Invest tokens in Compound
     * @param amount Amount of strategy tokens to invest
     * @return value Value represented by the joined amount
     */
    function join(uint256 amount, uint256, bytes memory) external override returns (uint256 value) {
        if (amount == 0) return 0;

        uint256 initialCTokenBalance = cToken.balanceOf(address(this));
        IERC20(token).approve(address(cToken), 0);
        IERC20(token).approve(address(cToken), amount);
        require(cToken.mint(amount) == 0, 'COMPOUND_MINT_FAILED');

        uint256 finalCTokenBalance = cToken.balanceOf(address(this));
        uint256 investedCTokenAmount = finalCTokenBalance - initialCTokenBalance;
        uint256 cTokenRate = cToken.exchangeRateStored();
        value = investedCTokenAmount.mulDown(cTokenRate);
    }

    /**
     * @dev Divest tokens from Compound
     * @param ratio Ratio of the invested position to divest
     * @return amount Amount of strategy tokens exited with
     * @return value Value represented by the exited amount
     */
    function exit(uint256 ratio, uint256, bytes memory) external override returns (uint256 amount, uint256 value) {
        if (ratio == 0) return (0, 0);
        require(ratio <= FixedPoint.ONE, 'COMPOUND_INVALID_RATIO');

        uint256 initialTokenBalance = IERC20(token).balanceOf(address(this));
        uint256 initialCTokenBalance = cToken.balanceOf(address(this));
        uint256 exitCTokenAmount = initialCTokenBalance.mulDown(ratio);
        require(cToken.redeem(exitCTokenAmount) == 0, 'COMPOUND_REDEEM_FAILED');

        uint256 finalTokenBalance = IERC20(token).balanceOf(address(this));
        amount = finalTokenBalance - initialTokenBalance;
        uint256 cTokenRate = cToken.exchangeRateStored();
        value = amount.mulDown(cTokenRate);
    }
}
