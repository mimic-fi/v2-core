// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';

import '@mimic-fi/v2-helpers/contracts/math/FixedPoint.sol';

import '../Wallet.sol';

contract StrategyMock {
    using FixedPoint for uint256;

    uint256 public constant EXIT_RATIO_PRECISION = 1e18;

    address public token;

    constructor(address _token) {
        token = _token;
    }

    function getToken() external view returns (address) {
        return token;
    }

    function getTotalValue() public view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function getValueRate() external pure returns (uint256) {
        return FixedPoint.ONE;
    }

    function onJoin(uint256 amount, bytes memory) external view returns (uint256, uint256) {
        return (amount, getTotalValue());
    }

    function onExit(uint256 ratio, bool, bytes memory) external returns (address, uint256, uint256, uint256) {
        uint256 totalValue = getTotalValue();
        uint256 value = SafeMath.div(totalValue.mulDown(ratio), EXIT_RATIO_PRECISION);
        IERC20(token).approve(msg.sender, value);
        return (token, value, value, totalValue - value);
    }
}
