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
 * @dev Bridge Connector implementation that interfaces with Hop Exchange only for now.
 *
 * It inherits from BaseImplementation which means it's implementation can be used directly from the Mimic Registry,
 * it does not require initialization.
 *
 * IMPORTANT! As many other implementations in this repo, this contract is intended to be used as a LIBRARY, not
 * a contract. Due to limitations of the Solidity compiler, it's not possible to work with immutable variables in
 * libraries yet. Therefore, we are relying on contracts without storage variables so they can be safely
 * delegate-called if desired.
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

    /**
     * @dev Bridge assets to a different chain
     * @param source Source to execute the requested bridge op
     * @param chainId ID of the destination chain
     * @param token Address of the token to be bridged
     * @param amountIn Amount of tokens to be bridged
     * @param minAmountOut Minimum amount of tokens willing to receive on the destination chain
     * @param data ABI encoded data that will depend on the requested source
     */
    function bridge(
        uint8 source,
        uint256 chainId,
        address token,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) external override {
        require(chainId != block.chainid, 'BRIDGE_CONNECTOR_SAME_CHAIN_OP');
        if (Source(source) == Source.Hop) return _bridgeHop(chainId, token, amountIn, minAmountOut, data);
        else revert('BRIDGE_CONNECTOR_INVALID_SOURCE');
    }
}
