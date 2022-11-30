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

    uint256 private constant MAINNET_CHAIN_ID = 1;
    uint256 private constant GOERLI_CHAIN_ID = 5;

    /**
     * @dev Internal function to bridge assets using Hop Exchange
     * @param chainId ID of the destination chain
     * @param token Address of the token to be bridged
     * @param amount Amount of tokens to be bridged
     * @param data ABI encoded data expected to include different information depending on source and destination chains
     */
    function _bridgeHop(uint256 chainId, address token, uint256 amount, bytes memory data) internal {
        bool toL2 = !_isL1(chainId);
        bool fromL1 = _isL1(block.chainid);

        if (fromL1 && toL2) _bridgeFromL1ToL2(chainId, token, amount, data);
        else if (!fromL1 && toL2) _bridgeFromL2ToL2(chainId, token, amount, data);
        else if (!fromL1 && !toL2) _bridgeFromL2ToL1(chainId, token, amount, data);
        else revert('HOP_BRIDGE_OP_NOT_SUPPORTED');
    }

    /**
     * @dev Internal function to bridge assets from L1 to L2
     * @param chainId ID of the destination chain
     * @param token Address of the token to be bridged
     * @param amount Amount of tokens to be bridged
     * @param data ABI encoded data to include:
     * - bridge: address of the Hop bridge corresponding to the token to be bridged
     * - slippage: slippage to be applied on L2 when swapping the hToken for the token to be bridged
     * - deadline: deadline to be applied on L2 when swapping the hToken for the token to be bridged
     * - relayer: only used if a 3rd party is relaying the transfer on the user's behalf
     * - relayer fee: only used if a 3rd party is relaying the transfer on the user's behalf
     */
    function _bridgeFromL1ToL2(uint256 chainId, address token, uint256 amount, bytes memory data) private {
        (address hopBridge, uint256 slippage, uint256 deadline, address relayer, uint256 relayerFee) = abi.decode(
            data,
            (address, uint256, uint256, address, uint256)
        );

        require(slippage <= FixedPoint.ONE, 'HOP_BRIDGE_INVALID_SLIPPAGE');
        require(deadline > block.timestamp, 'HOP_BRIDGE_INVALID_DEADLINE');

        IHopL1Bridge bridge = IHopL1Bridge(hopBridge);
        require(bridge.l1CanonicalToken() == token, 'HOP_BRIDGE_TOKEN_DOES_NOT_MATCH');
        IERC20(token).safeApprove(hopBridge, amount);

        uint256 minAmount = amount.mulUp(FixedPoint.ONE.uncheckedSub(slippage));
        bridge.sendToL2(chainId, address(this), amount, minAmount, deadline, relayer, relayerFee);
    }

    /**
     * @dev Internal function to bridge assets from L2 to L1
     * @param chainId ID of the destination chain
     * @param token Address of the token to be bridged
     * @param amount Amount of tokens to be bridged
     * @param data ABI encoded data to include:
     * - amm: address of the Hop AMM corresponding to the token to be bridged
     * - slippage: slippage to be applied on L2 when swapping the token for the hToken to be bridged
     * - deadline: deadline to be applied on L2 when swapping the token for the hToken to be bridged
     * - bonder fee: must be computed using the Hop SDK or API
     */
    function _bridgeFromL2ToL1(uint256 chainId, address token, uint256 amount, bytes memory data) private {
        (address hopAMM, uint256 bonderFee, uint256 slippage) = abi.decode(data, (address, uint256, uint256));
        require(slippage <= FixedPoint.ONE, 'HOP_BRIDGE_INVALID_SLIPPAGE');

        IHopL2AMM amm = IHopL2AMM(hopAMM);
        require(amm.l2CanonicalToken() == token, 'HOP_AMM_TOKEN_DOES_NOT_MATCH');
        IERC20(token).safeApprove(hopAMM, amount);

        uint256 minAmount = amount.mulUp(FixedPoint.ONE.uncheckedSub(slippage));
        // No destination min amount nor deadline needed since there is no AMM on L1
        amm.swapAndSend(chainId, address(this), amount, bonderFee, minAmount, block.timestamp, 0, 0);
    }

    /**
     * @dev Internal function to bridge assets from L2 to L2
     * @param chainId ID of the destination chain
     * @param token Address of the token to be bridged
     * @param amount Amount of tokens to be bridged
     * @param data ABI encoded data to include:
     * - amm: address of the Hop AMM corresponding to the token to be bridged
     * - slippage: slippage to be applied on both L2s when swapping the token for the hToken to be bridged
     * - deadline: deadline to be applied on the destination L2 when swapping the hToken for the token to be bridged
     * - bonder fee: must be computed using the Hop SDK or API
     */
    function _bridgeFromL2ToL2(uint256 chainId, address token, uint256 amount, bytes memory data) private {
        (address hopAMM, uint256 bonderFee, uint256 slippage, uint256 deadline) = abi.decode(
            data,
            (address, uint256, uint256, uint256)
        );

        require(slippage <= FixedPoint.ONE, 'HOP_BRIDGE_INVALID_SLIPPAGE');
        require(deadline > block.timestamp, 'HOP_BRIDGE_INVALID_DEADLINE');

        IHopL2AMM amm = IHopL2AMM(hopAMM);
        require(amm.l2CanonicalToken() == token, 'HOP_AMM_TOKEN_DOES_NOT_MATCH');
        IERC20(token).safeApprove(hopAMM, amount);

        uint256 currentMinAmount = amount.mulUp(FixedPoint.ONE.uncheckedSub(slippage));
        uint256 destinationMinAmount = amount.mulUp(FixedPoint.ONE.uncheckedSub(slippage));
        amm.swapAndSend(
            chainId,
            address(this),
            amount,
            bonderFee,
            currentMinAmount,
            block.timestamp,
            destinationMinAmount,
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
