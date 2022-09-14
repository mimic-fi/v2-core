// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '../implementations/InitializableImplementation.sol';

contract InitializableImplementationMock is InitializableImplementation {
    bytes32 public constant override NAMESPACE = keccak256('INITIALIZABLE_IMPLEMENTATION_MOCK');

    address public dependency;

    constructor(address registry) InitializableImplementation(registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function initialize() external initializer {
        _initialize();
    }

    function setDependency(address newInstance) external {
        _validateDependency(dependency, newInstance);
        dependency = newInstance;
    }
}
