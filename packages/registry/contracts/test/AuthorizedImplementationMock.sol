// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '../implementations/AuthorizedImplementation.sol';

contract AuthorizedImplementationMock is AuthorizedImplementation {
    bytes32 public constant override NAMESPACE = keccak256('AUTHORIZED_IMPLEMENTATION_MOCK');

    address public dependency;

    constructor(IRegistry registry) AuthorizedImplementation(registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function initialize(address admin) external initializer {
        _initialize(admin);
    }

    function setDependency(address implementation, bytes memory initializeData) external {
        dependency = _createInstanceFor(dependency, implementation, initializeData);
    }
}
