// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '../Implementation.sol';

contract ImplementationMock is Implementation {
    constructor(IRegistry _registry) Implementation(_registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function initialize(address admin) external initializer {
        _initialize(admin);
    }
}
