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

import '@mimic-fi/v2-helpers/contracts/auth/Authorizer.sol';

import './IRegistry.sol';

contract Registry is IRegistry, Authorizer {
    mapping (address => bool) internal activeImplementations;
    mapping (address => bytes32) public override getNamespace;

    constructor(address admin) {
        _authorize(admin, Registry.register.selector);
        _authorize(admin, Registry.unregister.selector);
        _authorize(admin, Authorizer.authorize.selector);
        _authorize(admin, Authorizer.unauthorize.selector);
    }

    function register(bytes32 namespace, address implementation) external override auth {
        require(namespace != bytes32(0), 'INVALID_NAMESPACE');
        require(!activeImplementations[implementation], 'IMPLEMENTATION_REGISTERED');

        bytes32 currentNamespace = getNamespace[implementation];
        require(currentNamespace == bytes32(0) || currentNamespace == namespace, 'IMPLEMENTATION_NAMESPACE_USED');

        getNamespace[implementation] = namespace;
        activeImplementations[implementation] = true;
        emit Registered(namespace, implementation);
    }

    function unregister(bytes32 namespace, address implementation) external override auth {
        require(activeImplementations[implementation], 'IMPLEMENTATION_NOT_REGISTERED');
        activeImplementations[implementation] = false;
        emit Unregistered(namespace, implementation);
    }

    function clone(bytes32 namespace, address implementation) external override returns (address instance) {
        require(isRegistered(namespace, implementation), 'IMPLEMENTATION_NOT_REGISTERED');
        instance = Clones.clone(address(implementation));
        emit Cloned(namespace, implementation, instance);
    }

    function isRegistered(bytes32 namespace, address implementation) public view override returns (bool) {
        return activeImplementations[implementation] && getNamespace[implementation] == namespace;
    }
}
