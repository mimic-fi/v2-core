// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@mimic-fi/v2-registry/contracts/implementations/BaseImplementation.sol';

contract PriceOracleMock is BaseImplementation {
    bytes32 public constant override NAMESPACE = keccak256('PRICE_ORACLE');

    uint256 public mockedRate;

    constructor(address registry) BaseImplementation(registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function mockRate(uint256 newMockedRate) external {
        mockedRate = newMockedRate;
    }

    function getPrice(address, address) external view returns (uint256) {
        return mockedRate;
    }
}
