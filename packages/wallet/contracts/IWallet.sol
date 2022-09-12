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

import '@mimic-fi/v2-swap-connector/contracts/ISwapConnector.sol';

interface IWallet {
    // solhint-disable-next-line func-name-mixedcase
    function NATIVE_TOKEN() external view returns (address);

    enum SwapLimit {
        Slippage,
        MinAmountOut
    }

    event StrategySet(address strategy);
    event PriceOracleSet(address priceOracle);
    event SwapConnectorSet(address swapConnector);
    event FeeCollectorSet(address feeCollector);
    event WithdrawFeeSet(uint256 withdrawFee);
    event PerformanceFeeSet(uint256 performanceFee);
    event SwapFeeSet(uint256 swapFee);
    event Collect(address indexed token, address indexed from, uint256 amount, bytes data);
    event Withdraw(address indexed token, address indexed recipient, uint256 amount, uint256 fee, bytes data);
    event Wrap(uint256 amount, bytes data);
    event Unwrap(uint256 amount, bytes data);
    event Claim(bytes data);
    event Join(uint256 amount, uint256 value, uint256 slippage, bytes data);
    event Exit(uint256 amount, uint256 value, uint256 fee, uint256 slippage, bytes data);
    event Swap(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 minAmountOut,
        uint256 fee,
        bytes data
    );

    function strategy() external view returns (address);

    function priceOracle() external view returns (address);

    function swapConnector() external view returns (address);

    function investedValue() external view returns (uint256);

    function feeCollector() external view returns (address);

    function withdrawFee() external view returns (uint256);

    function performanceFee() external view returns (uint256);

    function swapFee() external view returns (uint256);

    function wrappedNativeToken() external view returns (address);

    function setStrategy(address newStrategy) external;

    function setPriceOracle(address newPriceOracle) external;

    function setSwapConnector(address newSwapConnector) external;

    function setFeeCollector(address newFeeCollector) external;

    function setWithdrawFee(uint256 newWithdrawFee) external;

    function setPerformanceFee(uint256 newPerformanceFee) external;

    function setSwapFee(uint256 newSwapFee) external;

    function collect(address token, address from, uint256 amount, bytes memory data) external;

    function withdraw(address token, uint256 amount, address recipient, bytes memory data) external;

    function claim(bytes memory data) external;

    function wrap(uint256 amount, bytes memory data) external;

    function unwrap(uint256 amount, bytes memory data) external;

    function join(uint256 amount, uint256 slippage, bytes memory data) external;

    function exit(uint256 ratio, uint256 slippage, bytes memory data) external returns (uint256 received);

    function swap(
        ISwapConnector.Source source,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        SwapLimit limitType,
        uint256 limitAmount,
        bytes memory data
    ) external returns (uint256 amountOut);
}
