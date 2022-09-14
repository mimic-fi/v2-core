// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '../implementations/BaseImplementation.sol';

contract BaseImplementationMock is BaseImplementation {
    bytes32 public constant override NAMESPACE = keccak256('BASE_IMPLEMENTATION_MOCK');

    address public dependency;

    constructor(address registry) BaseImplementation(registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function setDependency(address newInstance) external {
        _validateDependency(dependency, newInstance);
        dependency = newInstance;
    }
}
