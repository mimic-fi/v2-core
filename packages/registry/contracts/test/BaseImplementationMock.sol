// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '../implementations/BaseImplementation.sol';

contract BaseImplementationMock is BaseImplementation {
    bytes32 public constant override NAMESPACE = keccak256('BASE_IMPLEMENTATION_MOCK');

    address public dependency;

    constructor(IRegistry registry) BaseImplementation(registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function initialize() external initializer {
        _initialize();
    }

    function setDependency(address implementation, bytes memory initializeData) external {
        dependency = _createInstanceFor(dependency, implementation, initializeData);
    }
}
