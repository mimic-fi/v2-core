// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import '@mimic-fi/v2-helpers/contracts/math/FixedPoint.sol';
import '@mimic-fi/v2-strategies/contracts/IStrategy.sol';
import '@mimic-fi/v2-registry/contracts/implementations/InitializableImplementation.sol';

import '../samples/TokenMock.sol';

contract StrategyMock is IStrategy, InitializableImplementation {
    using FixedPoint for uint256;

    bytes32 public constant override NAMESPACE = keccak256('STRATEGY');

    address public override token;

    event Claimed(bytes data);
    event Joined(uint256 amount, uint256 slippage, bytes data);
    event Exited(uint256 ratio, uint256 slippage, bytes data);

    constructor(address registry) InitializableImplementation(registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function initialize() external initializer {
        _initialize();
        token = address(new TokenMock('STR'));
    }

    function mockGains(uint256 multiplier) external {
        uint256 balance = IERC20(token).balanceOf(address(this));
        TokenMock(token).mint(address(this), balance * (multiplier - 1));
    }

    function mockLosses(uint256 divisor) external {
        uint256 balance = IERC20(token).balanceOf(address(this));
        TokenMock(token).burn(address(this), balance / divisor);
    }

    function lastValue() public view override returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function currentValue() public override returns (uint256) {
        claim(new bytes(0));
        return lastValue();
    }

    function valueRate() public pure override returns (uint256) {
        return FixedPoint.ONE;
    }

    function claim(bytes memory data) public override {
        emit Claimed(data);
    }

    function join(uint256 amount, uint256 slippage, bytes memory data) external override returns (uint256 value) {
        value = amount;
        emit Joined(amount, slippage, data);
    }

    function exit(uint256 ratio, uint256 slippage, bytes memory data)
        external
        override
        returns (uint256 amount, uint256 value)
    {
        value = currentValue().mulDown(ratio);
        amount = value.mulDown(valueRate());
        IERC20(token).approve(msg.sender, amount);
        emit Exited(ratio, slippage, data);
    }
}
