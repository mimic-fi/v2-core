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

import '@openzeppelin/contracts/proxy/utils/Initializable.sol';

import './IImplementation.sol';
import '../registry/IRegistry.sol';

abstract contract BaseImplementation is IImplementation, Initializable {
    IRegistry public immutable registry;

    constructor(IRegistry _registry) {
        registry = _registry;
        _disableInitializers();
    }

    /**
     * @dev Internal function to check a new instance is properly set up in the registry
     */
    function _initialize() internal view onlyInitializing {
        address implementation = registry.getImplementation(address(this));
        require(implementation != address(0), 'IMPLEMENTATION_NOT_REGISTERED');
        require(registry.isRegistered(this.NAMESPACE(), implementation), 'INVALID_NEW_IMPL_NAMESPACE');
        require(registry.getNamespace(implementation) == this.NAMESPACE(), 'INVALID_REGISTERED_NAMESPACE');
    }

    function _createInstanceFor(address currentInstance, address newImplementation, bytes memory initializeData)
        internal
        returns (address)
    {
        if (currentInstance != address(0)) {
            // Make sure the current implementation is registered
            address currentImplementation = registry.getImplementation(currentInstance);
            require(currentImplementation != address(0), 'CURRENT_IMPL_NOT_REGISTERED');

            // Make sure namespaces match for current and new implementations
            bytes32 currentNamespace = registry.getNamespace(currentImplementation);
            require(registry.isRegistered(currentNamespace, newImplementation), 'INVALID_NEW_IMPL_NAMESPACE');
        }

        // The registry checks the requested implementation is registered and active
        return registry.clone(newImplementation, initializeData);
    }
}
