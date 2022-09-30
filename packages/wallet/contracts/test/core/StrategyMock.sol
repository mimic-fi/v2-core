// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import '@mimic-fi/v2-helpers/contracts/math/FixedPoint.sol';
import '@mimic-fi/v2-strategies/contracts/IStrategy.sol';
import '@mimic-fi/v2-registry/contracts/implementations/BaseImplementation.sol';

import '../samples/TokenMock.sol';

contract StrategyMock is IStrategy, BaseImplementation {
    using FixedPoint for uint256;

    bytes32 public constant override NAMESPACE = keccak256('STRATEGY');

    address public immutable lpt;
    address public immutable override token;

    event Claimed(bytes data);
    event Joined(uint256 amount, uint256 slippage, bytes data);
    event Exited(uint256 ratio, uint256 slippage, bytes data);

    constructor(address registry) BaseImplementation(registry) {
        lpt = address(new TokenMock('LPT'));
        token = address(new TokenMock('TKN'));
    }

    function mockGains(address account, uint256 multiplier) external {
        uint256 balance = IERC20(lpt).balanceOf(account);
        TokenMock(lpt).mint(account, balance * (multiplier - 1));
    }

    function mockLosses(address account, uint256 divisor) external {
        uint256 balance = IERC20(lpt).balanceOf(account);
        TokenMock(lpt).burn(account, balance / divisor);
    }

    function valueRate() public pure override returns (uint256) {
        return FixedPoint.ONE;
    }

    function lastValue(address account) public view override returns (uint256) {
        return IERC20(lpt).balanceOf(account);
    }

    function claim(bytes memory data) external override returns (address[] memory tokens, uint256[] memory amounts) {
        emit Claimed(data);
        return (new address[](0), new uint256[](0));
    }

    function join(uint256 amount, uint256 slippage, bytes memory data) external override returns (uint256 value) {
        value = amount;
        TokenMock(token).burn(address(this), amount);
        TokenMock(lpt).mint(address(this), amount);
        emit Joined(amount, slippage, data);
    }

    function exit(uint256 ratio, uint256 slippage, bytes memory data)
        external
        override
        returns (uint256 amount, uint256 value)
    {
        value = lastValue(address(this)).mulDown(ratio);
        amount = value.mulDown(valueRate());
        TokenMock(lpt).burn(address(this), amount);
        TokenMock(token).mint(address(this), amount);
        emit Exited(ratio, slippage, data);
    }
}
