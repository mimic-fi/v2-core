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

import '@mimic-fi/v2-registry/contracts/implementations/BaseImplementation.sol';

import './IBridgeConnector.sol';
import './connectors/HopConnector.sol';

/**
 * @title BridgeConnector
 * @dev TODO
 */
contract BridgeConnector is IBridgeConnector, BaseImplementation, HopConnector {
    // Namespace under which the Swap Connector is registered in the Mimic Registry
    bytes32 public constant override NAMESPACE = keccak256('BRIDGE_CONNECTOR');

    /**
     * @dev Initializes the BridgeConnector contract
     * @param registry Address of the Mimic Registry
     */
    constructor(address registry) BaseImplementation(registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function bridge(Source source, uint256 chainId, address token, uint256 amount, bytes memory data)
        external
        override
    {
        require(chainId != block.chainid, 'BRIDGE_CONNECTOR_SAME_CHAIN_OP');
        if (source == Source.Hop) return _bridgeHop(chainId, token, amount, data);
        else revert('BRIDGE_CONNECTOR_INVALID_SOURCE');
    }
}
