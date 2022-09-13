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

import '@mimic-fi/v2-registry/contracts/registry/IRegistry.sol';
import '@mimic-fi/v2-registry/contracts/implementations/AuthorizedImplementation.sol';

import './ISmartVault.sol';

contract SmartVault is ISmartVault, AuthorizedImplementation {
    bytes32 public constant override NAMESPACE = keccak256('SMART_VAULT');

    address public override wallet;
    mapping (address => bool) public override isActionWhitelisted;

    constructor(IRegistry registry) AuthorizedImplementation(registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function initialize(address _admin, address _wallet) external initializer {
        _initialize(_admin);
        _setWallet(_wallet);
    }

    function setAction(address action, bool whitelisted) external override auth {
        isActionWhitelisted[action] = whitelisted;
        emit ActionSet(action, whitelisted);
    }

    function _setWallet(address newWallet) internal {
        _validateDependency(wallet, newWallet);
        wallet = newWallet;
        emit WalletSet(newWallet);
    }
}