import { deploy, getSigner, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { ethers } from 'hardhat'

describe('SwapConnector', () => {
  let swapConnector: Contract, registry: Contract

  beforeEach('deploy swap connector', async () => {
    const admin = await getSigner()
    registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [admin.address])
    swapConnector = await deploy('SwapConnector', [
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      registry.address,
    ])
  })

  describe('initialization', async () => {
    it('has a registry reference', async () => {
      expect(await swapConnector.registry()).to.be.equal(registry.address)
    })

    it('has the expected namespace', async () => {
      const expectedNamespace = ethers.utils.solidityKeccak256(['string'], ['SWAP_CONNECTOR'])
      expect(await swapConnector.NAMESPACE()).to.be.equal(expectedNamespace)
    })
  })
})
