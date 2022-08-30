// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import '@mimic-fi/v2-helpers/contracts/math/FixedPoint.sol';
import '@mimic-fi/v2-registry/contracts/implementations/BaseImplementation.sol';

import '../Wallet.sol';
import './TokenMock.sol';

contract StrategyMock is BaseImplementation {
    using FixedPoint for uint256;

    bytes32 public constant override NAMESPACE = keccak256('STRATEGY');

    address public token;

    constructor(IRegistry registry) BaseImplementation(registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function initialize() external initializer {
        _initialize();
        token = address(new TokenMock('STR'));
    }

    function join(
        uint256, /* amount */
        uint256, /* slippage */
        bytes memory /* data */
    ) external {
        // solhint-disable-previous-line no-empty-blocks
    }

    function claim(
        bytes memory /* data */
    ) external {
        // solhint-disable-previous-line no-empty-blocks
    }

    function exit(
        uint256 ratio,
        uint256, /* slippage */
        bytes memory /* data */
    ) external returns (uint256 amount) {
        uint256 balance = IERC20(token).balanceOf(address(this));
        amount = balance.mulDown(ratio);
        IERC20(token).approve(msg.sender, amount);
    }
}
