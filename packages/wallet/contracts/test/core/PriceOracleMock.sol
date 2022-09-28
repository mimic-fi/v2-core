// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@mimic-fi/v2-helpers/contracts/math/FixedPoint.sol';
import '@mimic-fi/v2-price-oracle/contracts/oracle/IPriceOracle.sol';
import '@mimic-fi/v2-registry/contracts/implementations/BaseImplementation.sol';

contract PriceOracleMock is IPriceOracle, BaseImplementation {
    bytes32 public constant override NAMESPACE = keccak256('PRICE_ORACLE');

    mapping (address => mapping (address => uint256)) public mockedRates;

    constructor(address registry) BaseImplementation(registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function mockRate(address base, address quote, uint256 newMockedRate) external {
        mockedRates[base][quote] = newMockedRate;
    }

    function getPrice(address, address base, address quote) external view override returns (uint256) {
        if (base == quote) return FixedPoint.ONE;
        return mockedRates[base][quote];
    }
}
