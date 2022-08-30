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
        require(registry.isRegistered(this.NAMESPACE(), implementation), 'INVALID_IMPLEMENTATION_NAMESPACE');
    }

    /**
     * @dev Internal function to validate a new dependency
     *      It checks the new dependency is registered in the same registry under the same namespace
     */
    function _validateDependency(address currentDependency, address newDependency) internal view {
        address newImplementation = registry.getImplementation(newDependency);
        if (newImplementation != address(0)) {
            // If there is an implementation registered for the new dependency, it means it's a new instance
            _validateDependencyInstance(currentDependency, newImplementation);
        } else {
            // Otherwise, check if the new dependency is actually an implementation
            // If that's the case there must be a namespace registered for it
            bytes32 newDependencyNamespace = registry.getNamespace(newDependency);
            require(newDependencyNamespace != bytes32(0), 'NEW_DEPENDENCY_NOT_REGISTERED');
            _validateDependencyImplementation(currentDependency, newDependency);
        }
    }

    /**
     * @dev Internal function to validate a new dependency instance
     */
    function _validateDependencyInstance(address currentDependency, address newImplementation) private view {
        if (currentDependency != address(0)) {
            // Make sure the current dependency is an instance too
            address currentImplementation = registry.getImplementation(currentDependency);
            require(currentImplementation != address(0), 'NEW_DEPENDENCY_MUST_BE_IMPL');

            // Make sure namespaces match
            bytes32 currentNamespace = registry.getNamespace(currentImplementation);
            require(registry.isRegistered(currentNamespace, newImplementation), 'INVALID_NEW_DEPENDENCY_NAMESPACE');
        }
    }

    /**
     * @dev Internal function to validate a new dependency implementation
     */
    function _validateDependencyImplementation(address currentDependency, address newImplementation) private view {
        if (currentDependency != address(0)) {
            // Make sure the current dependency is an implementation too
            bytes32 currentNamespace = registry.getNamespace(currentDependency);
            require(currentNamespace != bytes32(0), 'NEW_DEPENDENCY_MUST_BE_INSTANCE');

            // Make sure namespaces match
            require(registry.isRegistered(currentNamespace, newImplementation), 'INVALID_NEW_DEPENDENCY_NAMESPACE');
        }
    }
}
