// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@mimic-fi/v2-registry/contracts/implementations/IImplementation.sol';

contract PriceOracleMock is IImplementation {
    bytes32 public constant override NAMESPACE = keccak256('PRICE_ORACLE');

    uint256 public mockedRate;

    function mockRate(uint256 newMockedRate) external {
        mockedRate = newMockedRate;
    }

    function getPrice(address, address) external view returns (uint256) {
        return mockedRate;
    }
}
