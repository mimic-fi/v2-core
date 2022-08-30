// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/proxy/Clones.sol';
import '@openzeppelin/contracts/utils/Address.sol';

import '@mimic-fi/v2-helpers/contracts/auth/Authorizer.sol';

import './IRegistry.sol';

contract Registry is IRegistry, Authorizer {
    using Address for address;

    mapping (address => bool) public override isActive;
    mapping (address => bytes32) public override getNamespace;
    mapping (address => address) public override getImplementation;

    modifier active(address implementation) {
        require(implementation != address(0), 'INVALID_IMPLEMENTATION');
        require(getNamespace[implementation] != bytes32(0), 'UNREGISTERED_IMPLEMENTATION');
        require(isActive[implementation], 'DEPRECATED_IMPLEMENTATION');
        _;
    }

    constructor(address admin) {
        _authorize(admin, Registry.register.selector);
        _authorize(admin, Registry.deprecate.selector);
        _authorize(admin, Authorizer.authorize.selector);
        _authorize(admin, Authorizer.unauthorize.selector);
    }

    function isRegistered(bytes32 namespace, address implementation) public view override returns (bool) {
        return isActive[implementation] && getNamespace[implementation] == namespace;
    }

    function register(bytes32 namespace, address implementation) external override auth {
        require(namespace != bytes32(0), 'INVALID_NAMESPACE');
        require(implementation != address(0), 'INVALID_IMPLEMENTATION');
        require(getNamespace[implementation] == bytes32(0), 'REGISTERED_IMPLEMENTATION');
        require(getImplementation[implementation] == address(0), 'CANNOT_REGISTER_CLONE');

        isActive[implementation] = true;
        getNamespace[implementation] = namespace;
        emit Registered(namespace, implementation);
    }

    function deprecate(address implementation) external override auth active(implementation) {
        isActive[implementation] = false;
        emit Deprecated(getNamespace[implementation], implementation);
    }

    function clone(address implementation, bytes memory initializeData)
        external
        override
        active(implementation)
        returns (address instance)
    {
        instance = Clones.clone(address(implementation));
        getImplementation[instance] = implementation;
        bytes memory result = initializeData.length == 0
            ? new bytes(0)
            : instance.functionCall(initializeData, 'CLONE_INIT_FAILED');
        emit Cloned(getNamespace[implementation], implementation, instance, result);
    }
}
