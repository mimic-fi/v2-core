// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';

import '@mimic-fi/v2-helpers/contracts/math/FixedPoint.sol';
import '@mimic-fi/v2-registry/contracts/implementations/IImplementation.sol';

import '../Wallet.sol';

contract StrategyMock is IImplementation {
    bytes32 public constant override NAMESPACE = keccak256('STRATEGY');
}
