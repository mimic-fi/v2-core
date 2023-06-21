import {
  assertEvent,
  assertPermissions,
  deploy,
  fp,
  getSigner,
  getSigners,
  instanceAt,
  ZERO_ADDRESS,
} from '@mimic-fi/v2-helpers'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { ethers } from 'hardhat'

const randomAddress = (): string => ethers.utils.getAddress(ethers.utils.hexlify(ethers.utils.randomBytes(20)))

describe('Deployer', () => {
  let deployer: Contract, smartVault: Contract, permissionsManager: Contract, owners: string[]

  const permissionsManagerParams = {
    name: 'permissions-manager',
    impl: undefined,
  }

  const smartVaultParams = {
    name: 'smart-vault',
    impl: undefined,
    feeCollector: randomAddress(),
    feeCollectorAdmin: randomAddress(),
    strategies: [],
    priceFeedParams: [
      { base: randomAddress(), quote: randomAddress(), feed: randomAddress() },
      { base: randomAddress(), quote: randomAddress(), feed: randomAddress() },
    ],
    priceOracle: undefined,
    swapConnector: undefined,
    bridgeConnector: undefined,
    swapFee: { pct: fp(0.1), cap: fp(1), token: randomAddress(), period: 120 },
    bridgeFee: { pct: fp(0.2), cap: fp(2), token: randomAddress(), period: 180 },
    withdrawFee: { pct: fp(0.3), cap: fp(3), token: randomAddress(), period: 240 },
    performanceFee: { pct: fp(0.4), cap: fp(4), token: randomAddress(), period: 300 },
  }

  before('deploy deployer and dependencies', async () => {
    const mimic = await getSigner()
    const registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [
      mimic.address,
    ])

    const smartVault = await deploy('@mimic-fi/v2-smart-vault/artifacts/contracts/SmartVault.sol/SmartVault', [
      ZERO_ADDRESS,
      registry.address,
    ])

    const priceOracle = await deploy(
      '@mimic-fi/v2-price-oracle/artifacts/contracts/oracle/PriceOracle.sol/PriceOracle',
      [ZERO_ADDRESS, registry.address]
    )

    const swapConnector = await deploy(
      '@mimic-fi/v2-swap-connector/artifacts/contracts/SwapConnector.sol/SwapConnector',
      [ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, registry.address]
    )

    const bridgeConnector = await deploy(
      '@mimic-fi/v2-bridge-connector/artifacts/contracts/BridgeConnector.sol/BridgeConnector',
      [ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, registry.address]
    )

    const permissionsManager = await deploy(
      '@mimic-fi/v2-permissions-manager/artifacts/contracts/PermissionsManager.sol/PermissionsManager',
      [registry.address]
    )

    await registry.connect(mimic).register(await smartVault.NAMESPACE(), smartVault.address, false)
    await registry.connect(mimic).register(await priceOracle.NAMESPACE(), priceOracle.address, true)
    await registry.connect(mimic).register(await swapConnector.NAMESPACE(), swapConnector.address, true)
    await registry.connect(mimic).register(await bridgeConnector.NAMESPACE(), bridgeConnector.address, true)
    await registry.connect(mimic).register(await permissionsManager.NAMESPACE(), permissionsManager.address, true)

    smartVaultParams.impl = smartVault.address
    smartVaultParams.priceOracle = priceOracle.address
    smartVaultParams.swapConnector = swapConnector.address
    smartVaultParams.bridgeConnector = bridgeConnector.address
    permissionsManagerParams.impl = permissionsManager.address

    deployer = await deploy('Deployer', [registry.address])
  })

  const itSetsUpThePermissionsManagerCorrectly = () => {
    it('has set its permissions correctly', async () => {
      await assertPermissions(permissionsManager, [
        { name: 'owners', account: owners, roles: ['execute'] },
        { name: 'permissions manager', account: permissionsManager, roles: ['authorize', 'unauthorize'] },
        { name: 'fee collector admin', account: smartVaultParams.feeCollectorAdmin, roles: [] },
      ])
    })
  }

  const itSetsUpSmartVaultCorrectly = () => {
    it('sets a fee collector', async () => {
      expect(await smartVault.feeCollector()).to.be.equal(smartVaultParams.feeCollector)
    })

    it('sets a bridge fee', async () => {
      const bridgeFee = await smartVault.bridgeFee()

      expect(bridgeFee.pct).to.be.equal(smartVaultParams.bridgeFee.pct)
      expect(bridgeFee.cap).to.be.equal(smartVaultParams.bridgeFee.cap)
      expect(bridgeFee.token).to.be.equal(smartVaultParams.bridgeFee.token)
      expect(bridgeFee.period).to.be.equal(smartVaultParams.bridgeFee.period)
    })

    it('sets no swap fee', async () => {
      const swapFee = await smartVault.swapFee()

      expect(swapFee.pct).to.be.equal(smartVaultParams.swapFee.pct)
      expect(swapFee.cap).to.be.equal(smartVaultParams.swapFee.cap)
      expect(swapFee.token).to.be.equal(smartVaultParams.swapFee.token)
      expect(swapFee.period).to.be.equal(smartVaultParams.swapFee.period)
    })

    it('sets no withdraw fee', async () => {
      const withdrawFee = await smartVault.withdrawFee()

      expect(withdrawFee.pct).to.be.equal(smartVaultParams.withdrawFee.pct)
      expect(withdrawFee.cap).to.be.equal(smartVaultParams.withdrawFee.cap)
      expect(withdrawFee.token).to.be.equal(smartVaultParams.withdrawFee.token)
      expect(withdrawFee.period).to.be.equal(smartVaultParams.withdrawFee.period)
    })

    it('sets no performance fee', async () => {
      const performanceFee = await smartVault.performanceFee()

      expect(performanceFee.pct).to.be.equal(smartVaultParams.performanceFee.pct)
      expect(performanceFee.cap).to.be.equal(smartVaultParams.performanceFee.cap)
      expect(performanceFee.token).to.be.equal(smartVaultParams.performanceFee.token)
      expect(performanceFee.period).to.be.equal(smartVaultParams.performanceFee.period)
    })

    it('sets a price oracle', async () => {
      expect(await smartVault.priceOracle()).to.be.equal(smartVaultParams.priceOracle)
    })

    it('sets a swap connector', async () => {
      expect(await smartVault.swapConnector()).to.be.equal(smartVaultParams.swapConnector)
    })

    it('sets a bridge connector', async () => {
      expect(await smartVault.bridgeConnector()).to.be.equal(smartVaultParams.bridgeConnector)
    })
  }

  describe('deploy', () => {
    before('deploy', async () => {
      owners = (await getSigners(1, 4)).map((owner) => owner.address)
      const tx = await deployer.deploy('mimic-1', smartVaultParams, permissionsManagerParams, owners)

      const smartVaultEvent = await assertEvent(tx, 'SmartVaultDeployed')
      smartVault = await instanceAt('SmartVault', smartVaultEvent.args[2])

      const permissionsManagerEvent = await assertEvent(tx, 'PermissionsManagerDeployed')
      permissionsManager = await instanceAt('PermissionsManager', permissionsManagerEvent.args[2])
    })

    itSetsUpThePermissionsManagerCorrectly()

    it('has set the smart vault permissions correctly', async () => {
      await assertPermissions(smartVault, [
        { name: 'owner', account: owners, roles: [] },
        { name: 'permissions manager', account: permissionsManager, roles: ['authorize', 'unauthorize'] },
        { name: 'fee collector admin', account: smartVaultParams.feeCollectorAdmin, roles: ['setFeeCollector'] },
      ])
    })

    itSetsUpSmartVaultCorrectly()

    it('can authorize smart vault methods', async () => {
      const who = randomAddress()
      const what = smartVault.interface.getSighash('wrap')
      expect(await smartVault.isAuthorized(who, what)).to.be.false

      const owner = await getSigner(owners[0])
      const requests = [{ target: smartVault.address, changes: [{ grant: true, permission: { who, what } }] }]
      await permissionsManager.connect(owner).execute(requests)

      expect(await smartVault.isAuthorized(who, what)).to.be.true
    })
  })

  describe('deployPermissionsManager', () => {
    before('deploy', async () => {
      owners = (await getSigners(1, 4)).map((owner) => owner.address)
      const tx = await deployer.deployPermissionsManager('mimic-2', permissionsManagerParams, owners)
      const permissionsManagerEvent = await assertEvent(tx, 'PermissionsManagerDeployed')
      permissionsManager = await instanceAt('PermissionsManager', permissionsManagerEvent.args[2])
    })

    itSetsUpThePermissionsManagerCorrectly()
  })

  describe('deploySmartVault', () => {
    before('deploy', async () => {
      owners = (await getSigners(1, 4)).map((owner) => owner.address)
      const tx = await deployer.deploySmartVault('mimic-3', smartVaultParams, owners)
      const smartVaultEvent = await assertEvent(tx, 'SmartVaultDeployed')
      smartVault = await instanceAt('SmartVault', smartVaultEvent.args[2])
    })

    it('has set the smart vault permissions correctly', async () => {
      await assertPermissions(smartVault, [
        { name: 'owner', account: owners, roles: ['authorize', 'unauthorize'] },
        { name: 'fee collector admin', account: smartVaultParams.feeCollectorAdmin, roles: ['setFeeCollector'] },
      ])
    })

    itSetsUpSmartVaultCorrectly()

    it('can authorize smart vault methods', async () => {
      const who = randomAddress()
      const what = smartVault.interface.getSighash('wrap')
      expect(await smartVault.isAuthorized(who, what)).to.be.false

      const owner = await getSigner(owners[0])
      await smartVault.connect(owner).authorize(who, what)

      expect(await smartVault.isAuthorized(who, what)).to.be.true
    })
  })
})
