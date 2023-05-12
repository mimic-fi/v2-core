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

import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';

import '@mimic-fi/v2-helpers/contracts/auth/Authorizer.sol';
import '@mimic-fi/v2-helpers/contracts/auth/IAuthorizer.sol';
import '@mimic-fi/v2-registry/contracts/registry/IRegistry.sol';
import '@mimic-fi/v2-registry/contracts/implementations/BaseImplementation.sol';
import '@mimic-fi/v2-registry/contracts/implementations/InitializableAuthorizedImplementation.sol';

import './IPermissionsManager.sol';

/**
 * @title PermissionsManager
 * @dev This implementation is meant to be used as a proxy in order to control many `IAuthorizer` implementations.
 * It allows to implement a layout of permissions over a group of `IAuthorizer` implementations, otherwise in order
 * to connect a big number of `IAuthorizer` implementations between each other, admins would had to perform many
 * transactions manually.
 */
contract PermissionsManager is IPermissionsManager, InitializableAuthorizedImplementation, ReentrancyGuardUpgradeable {
    // Namespace under which the Permissions Manager is registered in the Mimic Registry
    bytes32 public constant override NAMESPACE = keccak256('PERMISSIONS_MANAGER');

    /**
     * @dev Creates a new Permissions Manager implementation
     * @param _registry Address of the Mimic Registry to be referenced
     */
    constructor(address _registry) InitializableAuthorizedImplementation(_registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    /**
     * @dev Initializes the Smart Vault instance
     * @param admin Address that will be granted with admin rights
     */
    function initialize(address admin) external initializer {
        __ReentrancyGuard_init();
        _initialize(address(this));
        _authorize(admin, PermissionsManager.execute.selector);
        _authorize(admin, PermissionsManager.execute.selector);
    }

    /**
     * @dev Executes a list of permissions change requests. Sender must be authorized.
     * @param requests List of requests to be executed
     */
    function execute(PermissionChangeRequest[] memory requests) external override auth nonReentrant {
        for (uint256 i = 0; i < requests.length; i++) _execute(requests[i]);
    }

    /**
     * @dev Executes a single permissions change request
     * @param request Request to be executed
     */
    function _execute(PermissionChangeRequest memory request) private {
        IAuthorizer target = request.target;
        for (uint256 i = 0; i < request.changes.length; i++) {
            PermissionChange memory change = request.changes[i];
            (change.grant ? target.authorize : target.unauthorize)(change.permission.who, change.permission.what);
        }
    }
}
