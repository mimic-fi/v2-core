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

import '@mimic-fi/v2-registry/contracts/implementations/InitializableAuthorizedImplementation.sol';

import './ISmartVault.sol';

/**
 * @title SmartVault
 * @dev Smart Vault contract in charge of listing the actions allowed for it and the wallet implementation where funds
 * are being held. It inherits from InitializableAuthorizedImplementation which means it's implementation can be cloned
 * from the Mimic Registry and should be initialized depending on each case.
 */
contract SmartVault is ISmartVault, InitializableAuthorizedImplementation {
    // Namespace under which the Smart Vault is registered in the Mimic Registry
    bytes32 public constant override NAMESPACE = keccak256('SMART_VAULT');

    // Mimic Wallet reference
    address public override wallet;

    // List of whitelisted actions indexed by address
    mapping (address => bool) public override isActionWhitelisted;

    /**
     * @dev Creates a new Smart Vault implementation with references that should be shared among all implementations
     * @param registry Address of the Mimic Registry
     */
    constructor(address registry) InitializableAuthorizedImplementation(registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    /**
     * @dev Initializes the Smart Vault instance
     * @param admin Address that will be granted with admin rights
     */
    function initialize(address admin) external initializer {
        _initialize(admin);
    }

    /**
     * @dev Sets the whitelist condition of an action. Sender must be authorized.
     * @param action Address of the action to be set
     * @param whitelisted Whether the given action should be whitelisted or not
     */
    function setAction(address action, bool whitelisted) external override auth {
        isActionWhitelisted[action] = whitelisted;
        emit ActionSet(action, whitelisted);
    }

    /**
     * @dev Sets the Mimic Wallet tied to a Smart Vault. Sender must be authorized. It can be set only once.
     * @param newWallet Address of the wallet to be set
     */
    function setWallet(address newWallet) external override auth {
        require(wallet == address(0), 'WALLET_ALREADY_SET');
        _validateStatefulDependency(newWallet);
        wallet = newWallet;
        emit WalletSet(newWallet);
    }
}
