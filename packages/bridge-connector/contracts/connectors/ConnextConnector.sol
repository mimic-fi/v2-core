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

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import '@mimic-fi/v2-helpers/contracts/utils/ERC20Helpers.sol';

import '../interfaces/IConnext.sol';

/**
 * @title ConnextConnector
 * @dev Interfaces with Connext to bridge tokens
 */
contract ConnextConnector {
    // Expected data length when bridging with Connext: relayer fee
    uint256 private constant ENCODED_DATA_LENGTH = 32;

    // List of chain domains supported by Connext
    uint32 private constant ETHEREUM_DOMAIN = 6648936;
    uint32 private constant POLYGON_DOMAIN = 1886350457;
    uint32 private constant ARBITRUM_DOMAIN = 1634886255;
    uint32 private constant OPTIMISM_DOMAIN = 1869640809;
    uint32 private constant GNOSIS_DOMAIN = 6778479;
    uint32 private constant BSC_DOMAIN = 6450786;

    // List of chain IDs supported by Connext
    uint256 private constant ETHEREUM_ID = 1;
    uint256 private constant POLYGON_ID = 137;
    uint256 private constant ARBITRUM_ID = 42161;
    uint256 private constant OPTIMISM_ID = 10;
    uint256 private constant GNOSIS_ID = 100;
    uint256 private constant BSC_ID = 56;

    // Reference to the Connext contract of the source chain
    address private immutable connext;

    /**
     * @dev Creates a new Connext connector
     * @param _connext Address of the Connext contract for the source chain
     */
    constructor(address _connext) {
        connext = _connext;
    }

    /**
     * @dev Internal function to bridge assets using Connext
     * @param chainId ID of the destination chain
     * @param token Address of the token to be bridged
     * @param amountIn Amount of tokens to be bridged
     * @param recipient Address that will receive the tokens on the destination chain
     * @param data ABI encoded data expected to include the Connext to be used
     */
    function _bridgeConnext(
        uint256 chainId,
        address token,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        bytes memory data
    ) internal {
        require(data.length == ENCODED_DATA_LENGTH, 'CONNEXT_INVALID_DATA_LENGTH');
        uint256 relayerFee = abi.decode(data, (uint256));
        require(relayerFee <= amountIn, 'CONNEXT_RELAYER_FEE_GT_AMOUNT_IN');

        uint32 domain = _getChainDomain(chainId);
        uint256 slippage = minAmountOut > amountIn ? 0 : 100 - ((minAmountOut * 100) / amountIn); // in BPS e.g. 30 = 0.3%
        uint256 amountInAfterFees = amountIn - relayerFee;

        ERC20Helpers.approve(token, connext, amountIn);
        IConnext(connext).xcall(
            domain,
            recipient,
            token,
            address(this), // This is the delegate address, the one that will be able to act in case the bridge fails
            amountInAfterFees,
            slippage,
            new bytes(0), // No call on the destination chain needed
            relayerFee
        );
    }

    /**
     * @dev Internal function to tell the chain domain based on a chain ID
     * @param chainId ID of the chain being queried
     * @return Chain domain associated to the requested chain ID
     */
    function _getChainDomain(uint256 chainId) private pure returns (uint32) {
        if (chainId == ETHEREUM_ID) return ETHEREUM_DOMAIN;
        else if (chainId == POLYGON_ID) return POLYGON_DOMAIN;
        else if (chainId == ARBITRUM_ID) return ARBITRUM_DOMAIN;
        else if (chainId == OPTIMISM_ID) return OPTIMISM_DOMAIN;
        else if (chainId == GNOSIS_ID) return GNOSIS_DOMAIN;
        else if (chainId == BSC_ID) return BSC_DOMAIN;
        else revert('CONNEXT_UNKNOWN_CHAIN_ID');
    }
}
