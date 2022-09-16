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

import './IAuthorizer.sol';

contract Authorizer is IAuthorizer {
    address public constant ANY_ADDRESS = address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);

    mapping (bytes4 => bool) private any;
    mapping (address => mapping (bytes4 => bool)) private authorized;

    modifier auth() {
        _authenticate(msg.sender, msg.sig);
        _;
    }

    function isAuthorized(address who, bytes4 what) public view override returns (bool) {
        return any[what] || authorized[who][what];
    }

    function authorize(address who, bytes4 what) external override auth {
        _authorize(who, what);
    }

    function unauthorize(address who, bytes4 what) external override auth {
        _unauthorize(who, what);
    }

    function _authenticate(address who, bytes4 what) internal view {
        require(isAuthorized(who, what), 'AUTH_SENDER_NOT_ALLOWED');
    }

    function _authorize(address who, bytes4 what) internal {
        if (who == ANY_ADDRESS) any[what] = true;
        else authorized[who][what] = true;
        emit Authorized(who, what);
    }

    function _unauthorize(address who, bytes4 what) internal {
        if (who == ANY_ADDRESS) any[what] = false;
        else authorized[who][what] = false;
        emit Unauthorized(who, what);
    }
}
