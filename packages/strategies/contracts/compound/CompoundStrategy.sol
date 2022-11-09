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

    // Underlying token that will be used as the strategy entry point
    IERC20 public immutable token;

    // cToken associated to the strategy token
    ICToken public immutable cToken;

    // Compound token
    IERC20 public immutable comp;

    // Address of the Compound comptroller
    Comptroller public immutable comptroller;

    /**
     * @dev Creates a new Compound strategy contract
     * @param _cToken Compound token associated to the strategy token
     * @param _registry Address of the Mimic Registry to be referenced
     */
    constructor(ICToken _cToken, address _registry) BaseImplementation(_registry) {
        cToken = _cToken;
        token = IERC20(_cToken.underlying());
        comp = _cToken.comptroller().getCompAddress();
        comptroller = _cToken.comptroller();
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
        tokens[0] = address(cToken);
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
        require(tokensIn.length == 1, 'COMPOUND_INVALID_TOKENS_IN_LEN');
        require(amountsIn.length == 1, 'COMPOUND_INVALID_AMOUNTS_IN_LEN');
        require(tokensIn[0] == address(token), 'COMPOUND_INVALID_JOIN_TOKEN');

        tokensOut = exitTokens();
        amountsOut = new uint256[](1);
        uint256 amountIn = amountsIn[0];
        if (amountIn == 0) return (tokensOut, amountsOut, 0);

        uint256 initialCTokenBalance = cToken.balanceOf(address(this));
        token.approve(address(cToken), 0);
        token.approve(address(cToken), amountIn);
        require(cToken.mint(amountIn) == 0, 'COMPOUND_MINT_FAILED');

        uint256 finalCTokenBalance = cToken.balanceOf(address(this));
        amountsOut[0] = finalCTokenBalance - initialCTokenBalance;

        uint256 cTokenRate = cToken.exchangeRateStored();
        value = amountsOut[0].mulDown(cTokenRate);
    }

    /**
     * @dev Divest tokens from Compound
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
        require(tokensIn.length == 1, 'COMPOUND_INVALID_TOKENS_IN_LEN');
        require(amountsIn.length == 1, 'COMPOUND_INVALID_AMOUNTS_IN_LEN');
        require(tokensIn[0] == address(cToken), 'COMPOUND_INVALID_EXIT_TOKEN');

        tokensOut = joinTokens();
        amountsOut = new uint256[](1);
        uint256 amountIn = amountsIn[0];
        if (amountIn == 0) return (tokensOut, amountsOut, 0);

        uint256 initialTokenBalance = token.balanceOf(address(this));
        uint256 initialCTokenBalance = cToken.balanceOf(address(this));
        require(cToken.redeem(amountIn) == 0, 'COMPOUND_REDEEM_FAILED');

        uint256 finalTokenBalance = token.balanceOf(address(this));
        amountsOut[0] = finalTokenBalance - initialTokenBalance;

        uint256 finalCTokenBalance = cToken.balanceOf(address(this));
        uint256 cTokenRate = cToken.exchangeRateStored();
        value = (initialCTokenBalance - finalCTokenBalance).mulDown(cTokenRate);
    }
}
