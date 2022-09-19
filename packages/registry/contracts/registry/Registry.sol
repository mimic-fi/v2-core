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

/**
 * @title Registry
 * @dev Registry of contracts that acts as a curated list of implementations and instances to be trusted by the Mimic
 * protocol. Here consumers can find either implementation contracts (to be cloned through proxies) and contract
 * instances (from cloned implementations).
 *
 * The registry follows the Authorizer mixin and only authorized parties are allowed to register implementations.
 * Instances are automatically registered when a new clone is requested to the registry.
 */
contract Registry is IRegistry, Authorizer {
    using Address for address;

    // Mapping of active implementations
    mapping (address => bool) public override isActive;

    // List of namespaces indexed by implementation address
    mapping (address => bytes32) public override getNamespace;

    // List of implementations indexed by instance address
    mapping (address => address) public override getImplementation;

    /**
     * @dev Modifier to make sure an implementation is active: registered and not deprecated.
     */
    modifier active(address implementation) {
        require(implementation != address(0), 'INVALID_IMPLEMENTATION');
        require(getNamespace[implementation] != bytes32(0), 'UNREGISTERED_IMPLEMENTATION');
        require(isActive[implementation], 'DEPRECATED_IMPLEMENTATION');
        _;
    }

    /**
     * @dev Initializes the registry contract
     * @param admin Address to be granted with register, deprecate, authorize, and unauthorize permissions
     */
    constructor(address admin) {
        _authorize(admin, Registry.register.selector);
        _authorize(admin, Registry.deprecate.selector);
        _authorize(admin, Authorizer.authorize.selector);
        _authorize(admin, Authorizer.unauthorize.selector);
    }

    /**
     * @dev Tells if a specific implementation is registered under a certain namespace
     * @param namespace Namespace asking for
     * @param implementation Address of the implementation to be checked
     */
    function isRegistered(bytes32 namespace, address implementation) public view override returns (bool) {
        return isActive[implementation] && getNamespace[implementation] == namespace;
    }

    /**
     * @dev Registers a new implementation for a given namespace. Sender must be authorized.
     * @param namespace Namespace to be used for the implementation
     * @param implementation Address of the implementation to be registered
     */
    function register(bytes32 namespace, address implementation) external override auth {
        require(namespace != bytes32(0), 'INVALID_NAMESPACE');
        require(implementation != address(0), 'INVALID_IMPLEMENTATION');
        require(getNamespace[implementation] == bytes32(0), 'REGISTERED_IMPLEMENTATION');
        require(getImplementation[implementation] == address(0), 'CANNOT_REGISTER_CLONE');

        isActive[implementation] = true;
        getNamespace[implementation] = namespace;
        emit Registered(namespace, implementation);
    }

    /**
     * @dev Deprecates a registered implementation. Sender must be authorized.
     * @param implementation Address of the implementation to be deprecated. It must be active.
     */
    function deprecate(address implementation) external override auth active(implementation) {
        isActive[implementation] = false;
        emit Deprecated(getNamespace[implementation], implementation);
    }

    /**
     * @dev Clones a registered implementation
     * @param implementation Address of the implementation to be cloned. It must be active.
     * @param initializeData Arbitrary data to be sent after deployment. It can be used to initialize the new instance.
     * @return instance Address of the new instance created
     */
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
