// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import '@mimic-fi/v2-helpers/contracts/math/FixedPoint.sol';
import '@mimic-fi/v2-swap-connector/contracts/ISwapConnector.sol';
import '@mimic-fi/v2-registry/contracts/implementations/IImplementation.sol';

contract SwapConnectorMock is ISwapConnector, IImplementation {
    using FixedPoint for uint256;

    bytes32 public constant override NAMESPACE = keccak256('SWAP_CONNECTOR');

    uint256 public mockedRate;

    function mockRate(uint256 newRate) external {
        mockedRate = newRate;
    }

    function swap(
        address, /* tokenIn */
        address tokenOut,
        uint256 amountIn,
        uint256, /* minAmountOut */
        bytes memory /* data */
    ) external override returns (uint256 amountOut) {
        amountOut = amountIn.mulDown(mockedRate);
        IERC20(tokenOut).transfer(msg.sender, amountOut);
    }
}
