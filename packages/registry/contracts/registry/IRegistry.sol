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

interface IRegistry is IAuthorizer {
    event Registered(bytes32 indexed namespace, address indexed implementation);
    event Deprecated(bytes32 indexed namespace, address indexed implementation);
    event Cloned(bytes32 indexed namespace, address indexed implementation, address instance, bytes initResult);

    function isActive(address implementation) external view returns (bool);

    function getNamespace(address implementation) external view returns (bytes32);

    function getImplementation(address cloned) external view returns (address);

    function isRegistered(bytes32 namespace, address implementation) external view returns (bool);

    function register(bytes32 namespace, address implementation) external;

    function deprecate(address implementation) external;

    function clone(address implementation, bytes memory initializeData) external returns (address);
}
