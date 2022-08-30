import { deploy, getSigners } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

import { createClone } from '../'

/* eslint-disable no-secrets/no-secrets */

describe('AuthorizedImplementation', () => {
  let instance: Contract, registry: Contract, admin: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin] = await getSigners()
  })

  beforeEach('deploy instance', async () => {
    registry = await deploy('Registry', [admin.address])
    instance = await createClone(registry, admin, 'AuthorizedImplementationMock', [registry.address], [admin.address])
  })

  describe('initialize', () => {
    it('has a registry reference', async () => {
      expect(await instance.registry()).to.be.equal(registry.address)
    })

    it('cannot be initialize', async () => {
      await expect(instance.initialize(admin.address)).to.be.revertedWith(
        'Initializable: contract is already initialized'
      )
    })

    it('authorizes the admin to authorize and unauthorize', async () => {
      const authorizeRole = instance.interface.getSighash('authorize')
      expect(await instance.isAuthorized(admin.address, authorizeRole)).to.be.true

      const unauthorizeRole = instance.interface.getSighash('unauthorize')
      expect(await instance.isAuthorized(admin.address, unauthorizeRole)).to.be.true
    })
  })
})