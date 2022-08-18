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

contract Authorizer {
    event Authorize(address indexed who, bytes4 what);
    event Unauthorize(address indexed who, bytes4 what);

    mapping (address => mapping (bytes4 => bool)) private authorized;

    modifier auth() {
        authenticate(msg.sender, msg.sig);
        _;
    }

    constructor(address admin) {
        _authorize(admin, Authorizer(this).authorize.selector);
        _authorize(admin, Authorizer(this).unauthorize.selector);
    }

    function isAuthorized(address who, bytes4 what) public view returns (bool) {
        return authorized[who][what];
    }

    function authenticate(address who, bytes4 what) public view {
        require(isAuthorized(who, what), 'AUTH_SENDER_NOT_ALLOWED');
    }

    function authorize(address who, bytes4 what) external auth {
        _authorize(who, what);
    }

    function unauthorize(address who, bytes4 what) external auth {
        _unauthorize(who, what);
    }

    function _authorize(address who, bytes4 what) private {
        authorized[who][what] = true;
        emit Authorize(who, what);
    }

    function _unauthorize(address who, bytes4 what) private {
        authorized[who][what] = false;
        emit Unauthorize(who, what);
    }
}
