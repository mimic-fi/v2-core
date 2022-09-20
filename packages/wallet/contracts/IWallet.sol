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

import '@mimic-fi/v2-helpers/contracts/auth/IAuthorizer.sol';
import '@mimic-fi/v2-registry/contracts/implementations/IImplementation.sol';

/**
 * @title IWallet
 * @dev Mimic Wallet interface to manage assets. It must support also `IImplementation` and `IAuthorizer`
 */
interface IWallet is IImplementation, IAuthorizer {
    enum SwapLimit {
        Slippage,
        MinAmountOut
    }

    /**
     * @dev Emitted every time a new strategy is set for the Mimic Wallet
     */
    event StrategySet(address strategy);

    /**
     * @dev Emitted every time a new price oracle is set for the Mimic Wallet
     */
    event PriceOracleSet(address priceOracle);

    /**
     * @dev Emitted every time a new swap connector is set for the Mimic Wallet
     */
    event SwapConnectorSet(address swapConnector);

    /**
     * @dev Emitted every time a new fee collector is set
     */
    event FeeCollectorSet(address feeCollector);

    /**
     * @dev Emitted every time the withdraw fee percentage is set
     */
    event WithdrawFeeSet(uint256 withdrawFee);

    /**
     * @dev Emitted every time the performance fee percentage is set
     */
    event PerformanceFeeSet(uint256 performanceFee);

    /**
     * @dev Emitted every time the swap fee percentage is set
     */
    event SwapFeeSet(uint256 swapFee);

    /**
     * @dev Emitted every time `call` is called
     */
    event Call(address indexed target, bytes data, uint256 value, bytes result);

    /**
     * @dev Emitted every time `collect` is called
     */
    event Collect(address indexed token, address indexed from, uint256 amount, bytes data);

    /**
     * @dev Emitted every time `withdraw` is called
     */
    event Withdraw(address indexed token, address indexed recipient, uint256 amount, uint256 fee, bytes data);

    /**
     * @dev Emitted every time `wrap` is called
     */
    event Wrap(uint256 amount, bytes data);

    /**
     * @dev Emitted every time `unwrap` is called
     */
    event Unwrap(uint256 amount, bytes data);

    /**
     * @dev Emitted every time `claim` is called
     */
    event Claim(bytes data);

    /**
     * @dev Emitted every time `join` is called
     */
    event Join(uint256 amount, uint256 value, uint256 slippage, bytes data);

    /**
     * @dev Emitted every time `exit` is called
     */
    event Exit(uint256 amount, uint256 value, uint256 fee, uint256 slippage, bytes data);

    /**
     * @dev Emitted every time `swap` is called
     */
    event Swap(
        uint8 indexed source,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 minAmountOut,
        uint256 fee,
        bytes data
    );

    /**
     * @dev Tells the strategy associated to a Mimic Wallet
     */
    function strategy() external view returns (address);

    /**
     * @dev Tells the price oracle associated to a Mimic Wallet
     */
    function priceOracle() external view returns (address);

    /**
     * @dev Tells the swap connector associated to a Mimic Wallet
     */
    function swapConnector() external view returns (address);

    /**
     * @dev Tells the current invested value
     */
    function investedValue() external view returns (uint256);

    /**
     * @dev Tells the address where fees will be deposited
     */
    function feeCollector() external view returns (address);

    /**
     * @dev Tells the withdraw fee percentage expressed with 16 decimals (1e18 = 100%)
     */
    function withdrawFee() external view returns (uint256);

    /**
     * @dev Tells the performance fee percentage expressed with 16 decimals (1e18 = 100%)
     */
    function performanceFee() external view returns (uint256);

    /**
     * @dev Tells the swap fee percentage expressed with 16 decimals (1e18 = 100%)
     */
    function swapFee() external view returns (uint256);

    /**
     * @dev Tells the address of the wrapped native token
     */
    function wrappedNativeToken() external view returns (address);

    /**
     * @dev Sets a new strategy to the Mimic Wallet
     * @param newStrategy Address of the new strategy to be set
     */
    function setStrategy(address newStrategy) external;

    /**
     * @dev Sets a new price oracle to the Mimic Wallet
     * @param newPriceOracle Address of the new price oracle to be set
     */
    function setPriceOracle(address newPriceOracle) external;

    /**
     * @dev Sets a new swap connector to the Mimic Wallet
     * @param newSwapConnector Address of the new swap connector to be set
     */
    function setSwapConnector(address newSwapConnector) external;

    /**
     * @dev Sets a new fee collector
     * @param newFeeCollector Address of the new fee collector to be set
     */
    function setFeeCollector(address newFeeCollector) external;

    /**
     * @dev Sets a new withdraw fee
     * @param newWithdrawFee Withdraw fee percentage to be set
     */
    function setWithdrawFee(uint256 newWithdrawFee) external;

    /**
     * @dev Sets a new performance fee
     * @param newPerformanceFee Performance fee percentage to be set
     */
    function setPerformanceFee(uint256 newPerformanceFee) external;

    /**
     * @dev Sets a new swap fee
     * @param newSwapFee Swap fee percentage to be set
     */
    function setSwapFee(uint256 newSwapFee) external;

    /**
     * @dev Execute an arbitrary call from the Mimic Wallet
     * @param target Address where the call will be sent
     * @param data Calldata to be used for the call
     * @param value Value in wei that will be attached to the call
     * @return result Call response if it was successful, otherwise it reverts
     */
    function call(address target, bytes memory data, uint256 value) external returns (bytes memory result);

    /**
     * @dev Collect tokens from a sender to the Mimic Wallet
     * @param token Address of the token to be collected
     * @param from Address where the tokens will be transfer from
     * @param amount Amount of tokens to be transferred
     * @param data Extra data that may enable or not different behaviors depending on the implementation
     */
    function collect(address token, address from, uint256 amount, bytes memory data) external;

    /**
     * @dev Withdraw tokens to an external account
     * @param token Address of the token to be withdrawn
     * @param amount Amount of tokens to withdraw
     * @param recipient Address where the tokens will be transferred to
     * @param data Extra data that may enable or not different behaviors depending on the implementation
     */
    function withdraw(address token, uint256 amount, address recipient, bytes memory data) external;

    /**
     * @dev Claim strategy rewards
     * @param data Extra data that may enable or not different behaviors depending on the implementation
     */
    function claim(bytes memory data) external;

    /**
     * @dev Wrap an amount of native tokens to the wrapped ERC20 version of it
     * @param amount Amount of native tokens to be wrapped
     * @param data Extra data that may enable or not different behaviors depending on the implementation
     */
    function wrap(uint256 amount, bytes memory data) external;

    /**
     * @dev Unwrap an amount of wrapped native tokens
     * @param amount Amount of wrapped native tokens to unwrapped
     * @param data Extra data that may enable or not different behaviors depending on the implementation
     */
    function unwrap(uint256 amount, bytes memory data) external;

    /**
     * @dev Join the Mimic Wallet strategy with an amount of tokens
     * @param amount Amount of strategy tokens to join with
     * @param slippage Slippage that will be used to compute the join
     * @param data Extra data that may enable or not different behaviors depending on the implementation
     */
    function join(uint256 amount, uint256 slippage, bytes memory data) external;

    /**
     * @dev Exit the Mimic Wallet strategy
     * @param ratio Percentage of the current position that will be exited
     * @param slippage Slippage that will be used to compute the exit
     * @param data Extra data that may enable or not different behaviors depending on the implementation
     */
    function exit(uint256 ratio, uint256 slippage, bytes memory data) external returns (uint256 received);

    /**
     * @dev Swaps two tokens
     * @param source Source to request the swap. It depends on the Swap Connector attached to the Mimic Wallet.
     * @param tokenIn Token being sent
     * @param tokenOut Token being received
     * @param amountIn Amount of tokenIn being swapped
     * @param limitType Swap limit to be applied: slippage or min amount out
     * @param limitAmount Amount of the swap limit to be applied depending on limitType
     * @param data Extra data that may enable or not different behaviors depending on the implementation
     * @return amountOut Received amount of tokens out
     */
    function swap(
        uint8 source,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        SwapLimit limitType,
        uint256 limitAmount,
        bytes memory data
    ) external returns (uint256 amountOut);
}
