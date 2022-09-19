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

pragma solidity >=0.8.0;

import '@mimic-fi/v2-helpers/contracts/auth/IAuthorizer.sol';

/**
 * @title IRegistry
 * @dev Registry interface, it must follow the IAuthorizer interface.
 */
interface IRegistry is IAuthorizer {
    /**
     * @dev Emitted every time a new implementation is registered
     */
    event Registered(bytes32 indexed namespace, address indexed implementation);

    /**
     * @dev Emitted every time an implementation is deprecated
     */
    event Deprecated(bytes32 indexed namespace, address indexed implementation);

    /**
     * @dev Emitted every time an implementation is cloned
     */
    event Cloned(bytes32 indexed namespace, address indexed implementation, address instance, bytes initResult);

    /**
     * @dev Tells if an implementation is active: registered and not-deprecated
     * @param implementation Address of the implementation to be checked
     */
    function isActive(address implementation) external view returns (bool);

    /**
     * @dev Tells the namespace under a requested implementation is registered
     * @param implementation Address of the implementation requesting the namespace of
     */
    function getNamespace(address implementation) external view returns (bytes32);

    /**
     * @dev Tells the implementation used for a contract instance
     * @param cloned Address of the instance to request it's implementation
     */
    function getImplementation(address cloned) external view returns (address);

    /**
     * @dev Tells if a specific implementation is registered under a certain namespace
     * @param namespace Namespace asking for
     * @param implementation Address of the implementation to be checked
     */
    function isRegistered(bytes32 namespace, address implementation) external view returns (bool);

    /**
     * @dev Registers a new implementation for a given namespace
     * @param namespace Namespace to be used for the implementation
     * @param implementation Address of the implementation to be registered
     */
    function register(bytes32 namespace, address implementation) external;

    /**
     * @dev Deprecates a registered implementation
     * @param implementation Address of the implementation to be deprecated
     */
    function deprecate(address implementation) external;

    /**
     * @dev Clones a registered implementation
     * @param implementation Address of the implementation to be cloned
     * @param initializeData Arbitrary data to be sent after deployment
     * @return instance Address of the new instance created
     */
    function clone(address implementation, bytes memory initializeData) external returns (address);
}
