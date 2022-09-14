// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import '@mimic-fi/v2-helpers/contracts/math/FixedPoint.sol';
import '@mimic-fi/v2-swap-connector/contracts/ISwapConnector.sol';
import '@mimic-fi/v2-registry/contracts/implementations/BaseImplementation.sol';

contract SwapConnectorMock is ISwapConnector, BaseImplementation {
    using FixedPoint for uint256;

    bytes32 public constant override NAMESPACE = keccak256('SWAP_CONNECTOR');

    uint256 public mockedRate;

    constructor(address registry) BaseImplementation(registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function mockRate(uint256 newRate) external {
        mockedRate = newRate;
    }

    function swap(
        ISwapConnector.Source, /* source */
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
