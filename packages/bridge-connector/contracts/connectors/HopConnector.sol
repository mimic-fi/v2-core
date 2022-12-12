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

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import '@mimic-fi/v2-helpers/contracts/math/FixedPoint.sol';
import '@mimic-fi/v2-helpers/contracts/math/UncheckedMath.sol';
import '@mimic-fi/v2-helpers/contracts/utils/Denominations.sol';

import '../interfaces/IHopL2AMM.sol';
import '../interfaces/IHopL1Bridge.sol';

/**
 * @title HopConnector
 * @dev Interfaces with Hop Exchange to bridge tokens
 */
contract HopConnector {
    using SafeERC20 for IERC20;
    using FixedPoint for uint256;
    using UncheckedMath for uint256;
    using Denominations for address;

    // Ethereum mainnet chain ID = 1
    uint256 private constant MAINNET_CHAIN_ID = 1;

    // Görli chain ID = 5
    uint256 private constant GOERLI_CHAIN_ID = 5;

    // Expected data length when bridging from L1 to L2: bridge, deadline, relayer, relayer fee
    uint256 private constant ENCODED_DATA_FROM_L1_TO_L2_LENGTH = 128;

    // Expected data length when bridging from L2 to L1: amm, bonder fee
    uint256 private constant ENCODED_DATA_FROM_L2_TO_L1_LENGTH = 64;

    // Expected data length when bridging from L2 to L2: amm, bonder fee, deadline
    uint256 private constant ENCODED_DATA_FROM_L2_TO_L2_LENGTH = 96;

    /**
     * @dev Internal function to bridge assets using Hop Exchange
     * @param chainId ID of the destination chain
     * @param token Address of the token to be bridged
     * @param amountIn Amount of tokens to be bridged
     * @param minAmountOut Minimum amount of tokens willing to receive on the destination chain
     * @param data ABI encoded data expected to include different information depending on source and destination chains
     */
    function _bridgeHop(uint256 chainId, address token, uint256 amountIn, uint256 minAmountOut, bytes memory data)
        internal
    {
        bool toL2 = !_isL1(chainId);
        bool fromL1 = _isL1(block.chainid);

        if (fromL1 && toL2) _bridgeFromL1ToL2(chainId, token, amountIn, minAmountOut, data);
        else if (!fromL1 && toL2) _bridgeFromL2ToL2(chainId, token, amountIn, minAmountOut, data);
        else if (!fromL1 && !toL2) _bridgeFromL2ToL1(chainId, token, amountIn, minAmountOut, data);
        else revert('HOP_BRIDGE_OP_NOT_SUPPORTED');
    }

    /**
     * @dev Internal function to bridge assets from L1 to L2
     * @param chainId ID of the destination chain
     * @param token Address of the token to be bridged
     * @param amountIn Amount of tokens to be bridged
     * @param minAmountOut Minimum amount of tokens willing to receive on the destination chain
     * @param data ABI encoded data to include:
     * - bridge: address of the Hop bridge corresponding to the token to be bridged
     * - deadline: deadline to be applied on L2 when swapping the hToken for the token to be bridged
     * - relayer: only used if a 3rd party is relaying the transfer on the user's behalf
     * - relayer fee: only used if a 3rd party is relaying the transfer on the user's behalf
     */
    function _bridgeFromL1ToL2(
        uint256 chainId,
        address token,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) private {
        require(data.length == ENCODED_DATA_FROM_L1_TO_L2_LENGTH, 'HOP_INVALID_L1_L2_DATA_LENGTH');
        (address hopBridge, uint256 deadline, address relayer, uint256 relayerFee) = abi.decode(
            data,
            (address, uint256, address, uint256)
        );

        IHopL1Bridge bridge = IHopL1Bridge(hopBridge);
        require(bridge.l1CanonicalToken() == token, 'HOP_BRIDGE_TOKEN_DOES_NOT_MATCH');
        require(deadline > block.timestamp, 'HOP_BRIDGE_INVALID_DEADLINE');

        IERC20(token).safeApprove(hopBridge, amountIn);
        bridge.sendToL2(chainId, address(this), amountIn, minAmountOut, deadline, relayer, relayerFee);
    }

    /**
     * @dev Internal function to bridge assets from L2 to L1
     * @param chainId ID of the destination chain
     * @param token Address of the token to be bridged
     * @param amountIn Amount of tokens to be bridged
     * @param minAmountOut Minimum amount of tokens willing to receive on the destination chain
     * @param data ABI encoded data to include:
     * - amm: address of the Hop AMM corresponding to the token to be bridged
     * - deadline: deadline to be applied on L2 when swapping the token for the hToken to be bridged
     * - bonder fee: must be computed using the Hop SDK or API
     */
    function _bridgeFromL2ToL1(
        uint256 chainId,
        address token,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) private {
        require(data.length == ENCODED_DATA_FROM_L2_TO_L1_LENGTH, 'HOP_INVALID_L2_L1_DATA_LENGTH');
        (address hopAMM, uint256 bonderFee) = abi.decode(data, (address, uint256));

        IHopL2AMM amm = IHopL2AMM(hopAMM);
        require(amm.l2CanonicalToken() == token, 'HOP_AMM_TOKEN_DOES_NOT_MATCH');

        IERC20(token).safeApprove(hopAMM, amountIn);
        amm.swapAndSend(chainId, address(this), amountIn, bonderFee, minAmountOut, block.timestamp, 0, 0);
        // No destination min amount nor deadline needed since there is no AMM on L1
    }

    /**
     * @dev Internal function to bridge assets from L2 to L2
     * @param chainId ID of the destination chain
     * @param token Address of the token to be bridged
     * @param amountIn Amount of tokens to be bridged
     * @param minAmountOut Minimum amount of tokens willing to receive on the destination chain
     * @param data ABI encoded data to include:
     * - amm: address of the Hop AMM corresponding to the token to be bridged
     * - deadline: deadline to be applied on the destination L2 when swapping the hToken for the token to be bridged
     * - bonder fee: must be computed using the Hop SDK or API
     */
    function _bridgeFromL2ToL2(
        uint256 chainId,
        address token,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory data
    ) private {
        require(data.length == ENCODED_DATA_FROM_L2_TO_L2_LENGTH, 'HOP_INVALID_L2_L2_DATA_LENGTH');
        (address hopAMM, uint256 bonderFee, uint256 deadline) = abi.decode(data, (address, uint256, uint256));

        IHopL2AMM amm = IHopL2AMM(hopAMM);
        require(amm.l2CanonicalToken() == token, 'HOP_AMM_TOKEN_DOES_NOT_MATCH');
        require(deadline > block.timestamp, 'HOP_BRIDGE_INVALID_DEADLINE');

        uint256 diff = amountIn - minAmountOut;
        uint256 intermediateMinAmountOut = amountIn - (diff / 2);

        IERC20(token).safeApprove(hopAMM, amountIn);
        amm.swapAndSend(
            chainId,
            address(this),
            amountIn,
            bonderFee,
            intermediateMinAmountOut,
            block.timestamp,
            minAmountOut,
            deadline
        );
    }

    /**
     * @dev Tells if a chain ID refers to L1 or not: currently only Ethereum Mainnet or Goerli
     * @param chainId ID of the chain being queried
     */
    function _isL1(uint256 chainId) private pure returns (bool) {
        return chainId == MAINNET_CHAIN_ID || chainId == GOERLI_CHAIN_ID;
    }
}
