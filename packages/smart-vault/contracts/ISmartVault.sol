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
import '@mimic-fi/v2-registry/contracts/implementations/IImplementation.sol';

/**
 * @title ISmartVault
 * @dev Smart Vault interface, it must follow IAuthorizer and IImplementation.
 */
interface ISmartVault is IImplementation, IAuthorizer {
    /**
     * @dev Emitted every time a new wallet is set
     */
    event WalletSet(address indexed wallet);

    /**
     * @dev Emitted every time a new action is set
     */
    event ActionSet(address indexed action, bool whitelisted);

    /**
     * @dev Tells the address of the Mimic Wallet tied to a Smart Vault
     */
    function wallet() external view returns (address);

    /**
     * @dev Tells whether a certain action is whitelisted or not
     * @param action Address of the action to be checked
     */
    function isActionWhitelisted(address action) external view returns (bool);

    /**
     * @dev Sets the Mimic Wallet tied to a Smart Vault
     * @param newWallet Address of the wallet to be set
     */
    function setWallet(address newWallet) external;

    /**
     * @dev Sets the whitelist condition of an action. Sender must be authorized.
     * @param action Address of the action to be set
     * @param whitelisted Whether the given action should be whitelisted or not
     */
    function setAction(address action, bool whitelisted) external;
}
