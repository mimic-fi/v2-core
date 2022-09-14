import { assertEvent, deploy, getSigners, instanceAt } from '@mimic-fi/v2-helpers'
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
  })

  beforeEach('deploy implementation', async () => {
    implementation = await deploy('InitializableImplementationMock', [registry.address])
  })

  describe('initialize', () => {
    context('when initializing the implementation', () => {
      it('has a registry reference', async () => {
        expect(await implementation.registry()).to.be.equal(registry.address)
      })

      it('cannot be initialize', async () => {
        await expect(implementation.initialize()).to.be.revertedWith('Initializable: contract is already initialized')
      })
    })

    context('when initializing a new instance', () => {
      context('when the implementation is registered', () => {
        beforeEach('register implementation', async () => {
          await registry.connect(admin).register(await implementation.NAMESPACE(), implementation.address)
        })

        it('can be initialized through the registry', async () => {
          const initializeData = implementation.interface.encodeFunctionData('initialize', [])
          const tx = await registry.clone(implementation.address, initializeData)
          const event = await assertEvent(tx, 'Cloned', { implementation })

          const instance = await instanceAt('InitializableImplementationMock', event.args.instance)
          expect(await registry.getImplementation(instance.address)).to.be.equal(implementation.address)
          await expect(implementation.initialize()).to.be.revertedWith('Initializable: contract is already initialized')
        })
      })

      context('when the implementation is not registered', () => {
        it('reverts', async () => {
          const initializeData = implementation.interface.encodeFunctionData('initialize', [])
          await expect(registry.clone(implementation.address, initializeData)).to.be.revertedWith(
            'UNREGISTERED_IMPLEMENTATION'
          )
        })
      })
    })
  })
})
