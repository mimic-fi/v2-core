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

/**
 * @dev Implementation contract to be used through proxies. Inheriting contracts are meant to be initialized through
 * initialization functions instead of constructor functions. It allows re-using the same logic contract while making
 * deployments cheaper.
 *
 * This implementation contract comes with an immutable reference to an implementations registry where it should be
 * registered as well (checked during initialization). It allows requesting new instances of other registered
 * implementations to as another safety check to make sure valid instances are referenced in case it's needed.
 */
abstract contract BaseImplementation is IImplementation, Initializable {
    // Immutable implementations registry reference
    IRegistry public immutable registry;

    /**
     * @dev Creates a new BaseImplementation. Note that initializers are disabled at creation time.
     */
    constructor(IRegistry _registry) {
        registry = _registry;
        _disableInitializers();
    }

    /**
     * @dev Initialization function to check a new instance is properly set up in the registry.
     * Note this function can only be called from a function marked with the `initializer` modifier.
     */
    function _initialize() internal view onlyInitializing {
        address implementation = registry.getImplementation(address(this));
        require(implementation != address(0), 'IMPLEMENTATION_NOT_REGISTERED');
        require(registry.isRegistered(this.NAMESPACE(), implementation), 'INVALID_NEW_IMPL_NAMESPACE');
    }

    /**
     * @dev Internal function to create a new instance of a registered implementation
     *      It checks the requested implementation is registered in the same registry under the same namespace
     *      In case the current instance was not set, it simply creates a new instance for the requested implementation
     */
    function _createInstanceFor(address currentInstance, address newImplementation, bytes memory initializeData)
        internal
        returns (address)
    {
        if (currentInstance != address(0)) {
            // Make sure the current implementation is registered
            address currentImplementation = registry.getImplementation(currentInstance);
            require(currentImplementation != address(0), 'CURRENT_IMPL_NOT_REGISTERED');

            // Make sure new implementation is registered
            bytes32 newNamespace = registry.getNamespace(newImplementation);
            require(newNamespace != bytes32(0), 'NEW_IMPL_NOT_REGISTERED');

            // Make sure namespaces match
            bytes32 currentNamespace = registry.getNamespace(currentImplementation);
            require(currentNamespace == newNamespace, 'INVALID_NEW_IMPL_NAMESPACE');
        }

        // The registry checks the requested implementation is registered and active
        return registry.clone(newImplementation, initializeData);
    }
}
