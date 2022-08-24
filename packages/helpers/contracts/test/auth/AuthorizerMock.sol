// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '../../auth/Authorizer.sol';

contract AuthorizerMock is Authorizer {
    constructor(address admin) {
        _authorize(admin, Authorizer.authorize.selector);
        _authorize(admin, Authorizer.unauthorize.selector);
    }
}
