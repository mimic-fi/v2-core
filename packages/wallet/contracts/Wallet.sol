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

import '@mimic-fi/v2-helpers/contracts/math/FixedPoint.sol';
import '@mimic-fi/v2-price-oracle/contracts/IPriceOracle.sol';
import '@mimic-fi/v2-swap-connector/contracts/ISwapConnector.sol';
import '@mimic-fi/v2-registry/contracts/implementations/AuthorizedImplementation.sol';

interface IStrategy {
    function token() external view returns (address);

    function join(uint256 amount, uint256 slippage, bytes memory data) external;

    function claim(bytes memory data) external;

    function exit(uint256 ratio, uint256 slippage, bytes memory data) external returns (uint256);
}

contract Wallet is AuthorizedImplementation {
    using SafeERC20 for IERC20;
    using FixedPoint for uint256;

    bytes32 public constant override NAMESPACE = keccak256('WALLET');

    address public strategy;
    address public priceOracle;
    address public swapConnector;

    event StrategySet(address strategy);
    event PriceOracleSet(address priceOracle);
    event SwapConnectorSet(address swapConnector);
    event Collect(address indexed token, address indexed from, uint256 amount, bytes data);
    event Withdraw(address indexed token, address indexed recipient, uint256 amount, bytes data);
    event Join(uint256 amount, uint256 slippage, bytes data);
    event Claim(bytes data);
    event Exit(uint256 amount, uint256 slippage, bytes data);
    event Swap(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 slippage,
        bytes data
    );

    constructor(IRegistry registry) AuthorizedImplementation(registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function initialize(address _admin, address _strategy, address _priceOracle, address _swapConnector)
        external
        initializer
    {
        _initialize(_admin);
        _setStrategy(_strategy);
        _setPriceOracle(_priceOracle);
        _setSwapConnector(_swapConnector);

        _authorize(_admin, Wallet.setPriceOracle.selector);
        _authorize(_admin, Wallet.setSwapConnector.selector);
        _authorize(_admin, Wallet.collect.selector);
        _authorize(_admin, Wallet.join.selector);
        _authorize(_admin, Wallet.claim.selector);
        _authorize(_admin, Wallet.exit.selector);
        _authorize(_admin, Wallet.swap.selector);
        _authorize(_admin, Wallet.withdraw.selector);
    }

    function getTokenBalance(address token) public view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function setPriceOracle(address newPriceOracle) external auth {
        _setPriceOracle(newPriceOracle);
    }

    function setSwapConnector(address newSwapConnector) external auth {
        _setSwapConnector(newSwapConnector);
    }

    function collect(address token, address from, uint256 amount, bytes memory data) external auth {
        _safeTransferFrom(token, from, address(this), amount);
        emit Collect(token, from, amount, data);
    }

    function join(uint256 amount, uint256 slippage, bytes memory data) external auth {
        require(amount > 0, 'JOIN_AMOUNT_ZERO');
        require(slippage <= FixedPoint.ONE, 'JOIN_SLIPPAGE_ABOVE_ONE');

        address token = IStrategy(strategy).token();
        _safeTransfer(token, strategy, amount);
        IStrategy(strategy).join(amount, slippage, data);
        emit Join(amount, slippage, data);
    }

    function claim(bytes memory data) external auth {
        IStrategy(strategy).claim(data);
        emit Claim(data);
    }

    function exit(uint256 ratio, uint256 slippage, bytes memory data) external auth returns (uint256 received) {
        require(ratio > 0 && ratio <= FixedPoint.ONE, 'EXIT_INVALID_RATIO');
        require(slippage <= FixedPoint.ONE, 'EXIT_SLIPPAGE_ABOVE_ONE');

        received = IStrategy(strategy).exit(ratio, slippage, data);
        address token = IStrategy(strategy).token();
        _safeTransferFrom(token, strategy, address(this), received);
        emit Exit(received, slippage, data);
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 slippage, bytes memory data)
        external
        auth
        returns (uint256 amountOut)
    {
        require(tokenIn != tokenOut, 'SWAP_SAME_TOKEN');
        require(slippage <= FixedPoint.ONE, 'SWAP_SLIPPAGE_ABOVE_ONE');

        uint256 price = IPriceOracle(priceOracle).getPrice(tokenOut, tokenIn);
        uint256 minAmountOut = amountIn.mulUp(price).mulUp(FixedPoint.ONE - slippage);

        ISwapConnector connector = ISwapConnector(swapConnector);
        _safeTransfer(tokenIn, address(connector), amountIn);
        uint256 preBalanceOut = getTokenBalance(tokenOut);
        amountOut = connector.swap(tokenIn, tokenOut, amountIn, minAmountOut, data);
        uint256 postBalanceOut = getTokenBalance(tokenOut);

        require(amountOut >= minAmountOut, 'SWAP_MIN_AMOUNT');
        require(postBalanceOut >= preBalanceOut.add(amountOut), 'SWAP_INVALID_AMOUNT_OUT');
        emit Swap(tokenIn, tokenOut, amountIn, amountOut, slippage, data);
    }

    function withdraw(address token, uint256 amount, address recipient, bytes memory data) external auth {
        require(amount > 0, 'WITHDRAW_AMOUNT_ZERO');
        require(recipient != address(0), 'RECIPIENT_ZERO');
        _safeTransfer(token, recipient, amount);
        emit Withdraw(token, recipient, amount, data);
    }

    /**
     * @dev Internal method to transfer ERC20 tokens from another account using Mimic's wallet allowance
     * @param token Address of the ERC20 token to transfer
     * @param from Address transferring the tokens from
     * @param to Address transferring the tokens to
     * @param amount Amount of tokens to transfer
     */
    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        if (amount > 0) {
            IERC20(token).safeTransferFrom(from, to, amount);
        }
    }

    /**
     * @dev Internal method to transfer ERC20 tokens from the Mimic wallet
     * @param token Address of the ERC20 token to transfer
     * @param to Address transferring the tokens to
     * @param amount Amount of tokens to transfer
     */
    function _safeTransfer(address token, address to, uint256 amount) internal {
        if (amount > 0) {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    /**
     * @dev Sets a new strategy. Only used in the constructor.
     * @param newStrategy New strategy to be set
     */
    function _setStrategy(address newStrategy) internal {
        _validateDependency(strategy, newStrategy);
        strategy = newStrategy;
        emit StrategySet(newStrategy);
    }

    /**
     * @dev Sets a new price oracle
     * @param newPriceOracle New price oracle to be set
     */
    function _setPriceOracle(address newPriceOracle) internal {
        _validateDependency(priceOracle, newPriceOracle);
        priceOracle = newPriceOracle;
        emit PriceOracleSet(newPriceOracle);
    }

    /**
     * @dev Sets a new swap connector
     * @param newSwapConnector New swap connector to be set
     */
    function _setSwapConnector(address newSwapConnector) internal {
        _validateDependency(swapConnector, newSwapConnector);
        swapConnector = newSwapConnector;
        emit SwapConnectorSet(newSwapConnector);
    }
}
