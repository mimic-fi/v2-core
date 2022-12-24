import { deploy, getSigners } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

/* eslint-disable no-secrets/no-secrets */

describe('InitializableImplementation', () => {
  let implementation: Contract, registry: Contract, admin: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin] = await getSigners()
  })

  beforeEach('deploy registry', async () => {
    registry = await deploy('Registry', [admin.address])
    implementation = await deploy('InitializableImplementationMock', [registry.address])
  })

  describe('initialize', () => {
    it('has a registry reference', async () => {
      expect(await implementation.registry()).to.be.equal(registry.address)
    })

    it('cannot be initialize', async () => {
      await expect(implementation.initialize()).to.be.revertedWith('Initializable: contract is already initialized')
    })
  })
})
