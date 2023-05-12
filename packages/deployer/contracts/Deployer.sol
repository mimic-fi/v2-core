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

import '@openzeppelin/contracts/proxy/Clones.sol';
import '@openzeppelin/contracts/utils/Address.sol';

import '@mimic-fi/v2-helpers/contracts/utils/Arrays.sol';
import '@mimic-fi/v2-helpers/contracts/math/UncheckedMath.sol';
import '@mimic-fi/v2-registry/contracts/registry/IRegistry.sol';
import '@mimic-fi/v2-permissions-manager/contracts/PermissionsManager.sol';
import '@mimic-fi/v2-smart-vault/contracts/SmartVault.sol';

contract Deployer is BaseImplementation {
    using Address for address;
    using UncheckedMath for uint256;

    // Deployer namespace
    bytes32 public constant override NAMESPACE = keccak256('DEPLOYER');

    // Namespace to use by this deployer to fetch ISmartVault implementations from the Mimic Registry
    bytes32 private constant SMART_VAULT_NAMESPACE = keccak256('SMART_VAULT');

    // Namespace to use by this deployer to fetch IPermissionsManager implementations from the Mimic Registry
    bytes32 private constant PERMISSIONS_MANAGER_NAMESPACE = keccak256('PERMISSIONS_MANAGER');

    // Namespace to use by this deployer to fetch IStrategy implementations from the Mimic Registry
    bytes32 private constant STRATEGY_NAMESPACE = keccak256('STRATEGY');

    // Namespace to use by this deployer to fetch IPriceOracle implementations from the Mimic Registry
    bytes32 private constant PRICE_ORACLE_NAMESPACE = keccak256('PRICE_ORACLE');

    // Namespace to use by this deployer to fetch ISwapConnector implementations from the Mimic Registry
    bytes32 private constant SWAP_CONNECTOR_NAMESPACE = keccak256('SWAP_CONNECTOR');

    // Namespace to use by this deployer to fetch IBridgeConnector implementations from the Mimic Registry
    bytes32 private constant BRIDGE_CONNECTOR_NAMESPACE = keccak256('BRIDGE_CONNECTOR');

    /**
     * @dev Emitted every time a smart vault is deployed
     */
    event SmartVaultDeployed(string indexed namespace, string indexed name, address indexed instance);

    /**
     * @dev Emitted every time a permissions manager is deployed
     */
    event PermissionsManagerDeployed(string indexed namespace, string indexed name, address indexed instance);

    /**
     * @dev Creates a new Deployer contract
     * @param registry Address of the Mimic Registry to be referenced
     */
    constructor(address registry) BaseImplementation(registry) {
        // solhint-disable-previous-line no-empty-blocks
    }

    /**
     * @dev Permissions Manager params
     * @param name Name to register the new Permissions Manager for the sender address
     * @param impl Address of the Permissions Manager implementation to be used
     */
    struct PermissionsManagerParams {
        string name;
        address impl;
    }

    /**
     * @dev Smart vault params
     * @param name Name to register the new Smart Vault for the sender address
     * @param impl Address of the Smart Vault implementation to be used
     * @param factory Address of the factory that will be used to deploy an instance of the Smart Vault
     * @param strategies List of strategies to be allowed for the Smart Vault
     * @param bridgeConnector Optional Bridge Connector to set for the Smart Vault
     * @param swapConnector Optional Swap Connector to set for the Smart Vault
     * @param priceOracle Optional Price Oracle to set for the Smart Vault
     * @param priceFeedParams List of price feeds to be set for the Smart Vault
     * @param feeCollector Address to be set as the fee collector
     * @param feeCollectorAdmin Address that will be allowed to change the fee collector
     * @param swapFee Swap fee params
     * @param bridgeFee Bridge fee params
     * @param withdrawFee Withdraw fee params
     * @param performanceFee Performance fee params
     */
    struct SmartVaultParams {
        string name;
        address impl;
        address[] strategies;
        address bridgeConnector;
        address swapConnector;
        address priceOracle;
        PriceFeedParams[] priceFeedParams;
        address feeCollector;
        address feeCollectorAdmin;
        SmartVaultFeeParams swapFee;
        SmartVaultFeeParams bridgeFee;
        SmartVaultFeeParams withdrawFee;
        SmartVaultFeeParams performanceFee;
    }

    /**
     * @dev Smart Vault price feed params
     * @param base Base token of the price feed
     * @param quote Quote token of the price feed
     * @param feed Address of the price feed
     */
    struct PriceFeedParams {
        address base;
        address quote;
        address feed;
    }

    /**
     * @dev Smart Vault fee configuration parameters
     * @param pct Percentage expressed using 16 decimals (1e18 = 100%)
     * @param cap Maximum amount of fees to be charged per period
     * @param token Address of the token to express the cap amount
     * @param period Period length in seconds
     */
    struct SmartVaultFeeParams {
        uint256 pct;
        uint256 cap;
        address token;
        uint256 period;
    }

    /**
     * @dev Deploys a new smart vault environment
     */
    function deploy(
        string memory namespace,
        SmartVaultParams memory smartVaultParams,
        PermissionsManagerParams memory permissionsManagerParams,
        address[] memory owners
    ) external {
        IPermissionsManager manager = deployPermissionsManager(namespace, permissionsManagerParams, owners);
        deploySmartVault(namespace, smartVaultParams, Arrays.from(address(manager)));
    }

    /**
     * @dev Deploy a new Permissions Manager instance
     * @param namespace Namespace to register the Permissions Manager for the sender address
     * @param params Deployment params to set up a Permissions Manager
     * @param owners List of addresses that will have permissions to execute the Permissions Manager
     */
    function deployPermissionsManager(
        string memory namespace,
        PermissionsManagerParams memory params,
        address[] memory owners
    ) public returns (IPermissionsManager manager) {
        require(bytes(params.name).length > 0, 'PERMISSIONS_MANAGER_NAME_EMPTY');
        require(params.impl != address(0), 'PERMISSIONS_MANAGER_IMPL_ZERO');

        // Clone requested Permissions Manager implementation and initialize
        require(IRegistry(registry).isActive(PERMISSIONS_MANAGER_NAMESPACE, params.impl), 'BAD_PERMISSIONS_MGR_IMPL');
        bytes memory initializeData = abi.encodeWithSelector(PermissionsManager.initialize.selector, address(this));
        manager = IPermissionsManager(payable(_clone(namespace, params.name, params.impl, initializeData)));
        emit PermissionsManagerDeployed(namespace, params.name, address(manager));

        // Build requests to authorize owners to execute on Permissions Manager and unauthorize deployer
        IPermissionsManager.PermissionChangeRequest memory request;
        request.target = manager;
        request.changes = new IPermissionsManager.PermissionChange[](owners.length + 1);
        request.changes[owners.length] = _buildPermissionChange(false, manager.execute.selector, address(this));
        for (uint256 i = 0; i < owners.length; i = i.uncheckedAdd(1)) {
            request.changes[i] = _buildPermissionChange(true, manager.execute.selector, owners[i]);
        }

        // Execute permissions manager requests
        IPermissionsManager.PermissionChangeRequest[]
            memory requests = new IPermissionsManager.PermissionChangeRequest[](1);
        requests[0] = request;
        manager.execute(requests);
    }

    /**
     * @dev Deploy a new Smart Vault instance
     * @param namespace Namespace to register the Smart Vault for the sender address
     * @param params Deployment params to set up a Smart Vault
     * @param owners List of addresses that will have permissions to authorize and unauthorize accounts
     */
    function deploySmartVault(string memory namespace, SmartVaultParams memory params, address[] memory owners)
        public
        returns (ISmartVault smartVault)
    {
        require(bytes(params.name).length > 0, 'SMART_VAULT_NAME_EMPTY');
        require(params.impl != address(0), 'SMART_VAULT_IMPL_ZERO');
        require(params.feeCollector != address(0), 'SMART_VAULT_FEE_COLLECTOR_ZERO');
        require(params.feeCollectorAdmin != address(0), 'SMART_VAULT_FEE_ADMIN_ZERO');

        // Clone requested Smart Vault implementation and initialize
        require(IRegistry(registry).isActive(SMART_VAULT_NAMESPACE, params.impl), 'BAD_SMART_VAULT_IMPLEMENTATION');
        bytes memory initializeData = abi.encodeWithSelector(SmartVault.initialize.selector, address(this));
        smartVault = ISmartVault(payable(_clone(namespace, params.name, params.impl, initializeData)));
        emit SmartVaultDeployed(namespace, params.name, address(smartVault));

        // Set price feeds if any
        if (params.priceFeedParams.length > 0) {
            smartVault.authorize(address(this), smartVault.setPriceFeed.selector);
            for (uint256 i = 0; i < params.priceFeedParams.length; i = i.uncheckedAdd(1)) {
                PriceFeedParams memory feedParams = params.priceFeedParams[i];
                smartVault.setPriceFeed(feedParams.base, feedParams.quote, feedParams.feed);
            }
            smartVault.unauthorize(address(this), smartVault.setPriceFeed.selector);
        }

        // Set price oracle if given
        if (params.priceOracle != address(0)) {
            bool isActive = IRegistry(registry).isActive(PRICE_ORACLE_NAMESPACE, params.priceOracle);
            require(isActive, 'BAD_PRICE_ORACLE_DEPENDENCY');
            smartVault.authorize(address(this), smartVault.setPriceOracle.selector);
            smartVault.setPriceOracle(params.priceOracle);
            smartVault.unauthorize(address(this), smartVault.setPriceOracle.selector);
        }

        // Set strategies if any
        if (params.strategies.length > 0) {
            smartVault.authorize(address(this), smartVault.setStrategy.selector);
            for (uint256 i = 0; i < params.strategies.length; i = i.uncheckedAdd(1)) {
                bool isActive = IRegistry(registry).isActive(STRATEGY_NAMESPACE, params.strategies[i]);
                require(isActive, 'BAD_STRATEGY_DEPENDENCY');
                smartVault.setStrategy(params.strategies[i], true);
            }
            smartVault.unauthorize(address(this), smartVault.setStrategy.selector);
        }

        // Set swap connector if given
        if (params.swapConnector != address(0)) {
            bool isActive = IRegistry(registry).isActive(SWAP_CONNECTOR_NAMESPACE, params.swapConnector);
            require(isActive, 'BAD_SWAP_CONNECTOR_DEPENDENCY');
            smartVault.authorize(address(this), smartVault.setSwapConnector.selector);
            smartVault.setSwapConnector(params.swapConnector);
            smartVault.unauthorize(address(this), smartVault.setSwapConnector.selector);
        }

        // Set bridge connector if given
        if (params.bridgeConnector != address(0)) {
            bool isActive = IRegistry(registry).isActive(BRIDGE_CONNECTOR_NAMESPACE, params.bridgeConnector);
            require(isActive, 'BAD_BRIDGE_CONNECTOR_DEPENDENCY');
            smartVault.authorize(address(this), smartVault.setBridgeConnector.selector);
            smartVault.setBridgeConnector(params.bridgeConnector);
            smartVault.unauthorize(address(this), smartVault.setBridgeConnector.selector);
        }

        // Set fee collector
        smartVault.authorize(params.feeCollectorAdmin, smartVault.setFeeCollector.selector);
        smartVault.authorize(address(this), smartVault.setFeeCollector.selector);
        smartVault.setFeeCollector(params.feeCollector);
        smartVault.unauthorize(address(this), smartVault.setFeeCollector.selector);

        // Set withdraw fee if not zero
        SmartVaultFeeParams memory withdrawFee = params.withdrawFee;
        if (withdrawFee.pct != 0) {
            smartVault.authorize(address(this), smartVault.setWithdrawFee.selector);
            smartVault.setWithdrawFee(withdrawFee.pct, withdrawFee.cap, withdrawFee.token, withdrawFee.period);
            smartVault.unauthorize(address(this), smartVault.setWithdrawFee.selector);
        }

        // Set swap fee if not zero
        SmartVaultFeeParams memory swapFee = params.swapFee;
        if (swapFee.pct != 0) {
            smartVault.authorize(address(this), smartVault.setSwapFee.selector);
            smartVault.setSwapFee(swapFee.pct, swapFee.cap, swapFee.token, swapFee.period);
            smartVault.unauthorize(address(this), smartVault.setSwapFee.selector);
        }

        // Set bridge fee if not zero
        SmartVaultFeeParams memory bridgeFee = params.bridgeFee;
        if (bridgeFee.pct != 0) {
            smartVault.authorize(address(this), smartVault.setBridgeFee.selector);
            smartVault.setBridgeFee(bridgeFee.pct, bridgeFee.cap, bridgeFee.token, bridgeFee.period);
            smartVault.unauthorize(address(this), smartVault.setBridgeFee.selector);
        }

        // Set performance fee if not zero
        SmartVaultFeeParams memory perfFee = params.performanceFee;
        if (perfFee.pct != 0) {
            smartVault.authorize(address(this), smartVault.setPerformanceFee.selector);
            smartVault.setPerformanceFee(perfFee.pct, perfFee.cap, perfFee.token, perfFee.period);
            smartVault.unauthorize(address(this), smartVault.setPerformanceFee.selector);
        }

        // Authorize owners on Smart Vault
        for (uint256 i = 0; i < owners.length; i = i.uncheckedAdd(1)) {
            smartVault.authorize(owners[i], smartVault.authorize.selector);
            smartVault.authorize(owners[i], smartVault.unauthorize.selector);
        }

        // Unauthorize deployer on Smart Vault
        smartVault.unauthorize(address(this), smartVault.authorize.selector);
        smartVault.unauthorize(address(this), smartVault.unauthorize.selector);
    }

    /**
     * @dev Creates a new clone to an implementation using CREATE2
     * @param namespace Namespace to register the new instance for the sender address
     * @param name Name to register the new instance for the sender address
     * @param implementation Address of the implementation to be instanced. It must be registered and not deprecated.
     * @param initializeData Arbitrary data to be sent after deployment. It can be used to initialize the new instance.
     * @return instance Address of the new instance created
     */
    function _clone(string memory namespace, string memory name, address implementation, bytes memory initializeData)
        internal
        returns (address instance)
    {
        bytes32 salt = keccak256(abi.encodePacked(msg.sender, namespace, name));
        instance = Clones.cloneDeterministic(address(implementation), salt);
        if (initializeData.length > 0) {
            instance.functionCall(initializeData, 'DEPLOYER_CLONE_INIT_FAILED');
        }
    }

    /**
     * @dev Build permissions change
     */
    function _buildPermissionChange(bool grant, bytes4 what, address who)
        internal
        pure
        returns (IPermissionsManager.PermissionChange memory)
    {
        return IPermissionsManager.PermissionChange(grant, IPermissionsManager.Permission(what, who));
    }
}
