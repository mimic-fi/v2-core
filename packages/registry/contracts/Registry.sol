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

import '@mimic-fi/v2-helpers/contracts/auth/Authorizer.sol';

import './IRegistry.sol';

contract Registry is IRegistry, Authorizer {
    mapping (bytes32 => mapping (address => bool)) public override isRegistered;

    constructor(address admin) Authorizer(admin) {
        _authorize(admin, Registry.register.selector);
        _authorize(admin, Registry.unregister.selector);
    }

    function register(bytes32 namespace, address implementation) external override auth {
        isRegistered[namespace][implementation] = true;
        emit Registered(namespace, implementation);
    }

    function unregister(bytes32 namespace, address implementation) external override auth {
        isRegistered[namespace][implementation] = false;
        emit Unregistered(namespace, implementation);
    }
}
