import { deploy, getSigner } from '@mimic-fi/v2-helpers'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { ethers } from 'hardhat'

describe('BridgeConnector', () => {
  let bridgeConnector: Contract, registry: Contract

  beforeEach('deploy bridge connector', async () => {
    const admin = await getSigner()
    registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [admin.address])
    bridgeConnector = await deploy('BridgeConnector', [registry.address])
  })

  describe('initialization', async () => {
    it('has a registry reference', async () => {
      expect(await bridgeConnector.registry()).to.be.equal(registry.address)
    })

    it('has the expected namespace', async () => {
      const expectedNamespace = ethers.utils.solidityKeccak256(['string'], ['BRIDGE_CONNECTOR'])
      expect(await bridgeConnector.NAMESPACE()).to.be.equal(expectedNamespace)
    })
  })
})
