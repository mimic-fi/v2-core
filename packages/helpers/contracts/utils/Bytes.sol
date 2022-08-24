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

/**
 * @title Bytes
 * @dev Helper methods to operate bytes-related types
 */
library Bytes {
    /**
     * @dev Casts a bytes32 word into bytes4 grabbing the four most significant bytes
     */
    function toBytes4(bytes32 self) internal pure returns (bytes4) {
        return bytes4(self);
    }

    /**
     * @dev Casts a bytes array into bytes4 grabbing the four most significant bytes
     */
    function toBytes4(bytes memory self) internal pure returns (bytes4) {
        return bytes4(self[0]) | (bytes4(self[1]) >> 8) | (bytes4(self[2]) >> 16) | (bytes4(self[3]) >> 24);
    }

    /**
     * @dev Casts a bytes4 into bytes32 filling with zeros the least significant bytes
     */
    function toBytes32(bytes4 self) internal pure returns (bytes32 result) {
        assembly {
            result := self
        }
    }

    /**
     * @dev Concatenates an address to a bytes array
     */
    function concat(bytes memory self, address value) internal pure returns (bytes memory) {
        return abi.encodePacked(self, value);
    }

    /**
     * @dev Concatenates an uint24 to a bytes array
     */
    function concat(bytes memory self, uint24 value) internal pure returns (bytes memory) {
        return abi.encodePacked(self, value);
    }
}
