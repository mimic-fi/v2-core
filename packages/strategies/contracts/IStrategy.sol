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

import '@mimic-fi/v2-registry/contracts/implementations/IImplementation.sol';

interface IStrategy is IImplementation {
    function token() external view returns (address);

    function lastValue() external view returns (uint256);

    function currentValue() external returns (uint256);

    function valueRate() external view returns (uint256);

    function claim(bytes memory data) external;

    function join(uint256 amount, uint256 slippage, bytes memory data) external returns (uint256 value);

    function exit(uint256 ratio, uint256 slippage, bytes memory data) external returns (uint256 amount, uint256 value);
}
