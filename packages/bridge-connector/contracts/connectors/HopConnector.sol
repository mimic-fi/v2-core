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
 * @dev Interfaces with Hop to bridge tokens
 */
contract HopConnector {
    using SafeERC20 for IERC20;
    using FixedPoint for uint256;
    using UncheckedMath for uint256;
    using Denominations for address;

    uint256 private constant ETHEREUM_CHAIN_ID = 1;

    function _bridgeHop(uint256 chainId, address token, uint256 amount, bytes memory data) internal {
        bool toL2 = chainId != ETHEREUM_CHAIN_ID;
        bool fromL1 = block.chainid == ETHEREUM_CHAIN_ID;

        if (fromL1 && toL2) _bridgeFromL1ToL2(chainId, token, amount, data);
        else if (!fromL1 && toL2) _bridgeFromL2ToL2(chainId, token, amount, data);
        else if (!fromL1 && !toL2) _bridgeFromL2ToL1(chainId, token, amount, data);
        else revert('HOP_BRIDGE_OP_NOT_SUPPORTED');
    }

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
}
