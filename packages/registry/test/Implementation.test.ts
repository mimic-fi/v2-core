import { assertEvent, assertIndirectEvent, deploy, getSigners, instanceAt, ONES_BYTES32 } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

/* eslint-disable no-secrets/no-secrets */

describe('BaseImplementation', () => {
  let implementation: Contract, registry: Contract, admin: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin] = await getSigners()
  })

  beforeEach('deploy implementation', async () => {
    registry = await deploy('Registry', [admin.address])
    implementation = await deploy('BaseImplementationMock', [registry.address])
  })

  describe('initialize', () => {
    it('has a registry reference', async () => {
      expect(await implementation.registry()).to.be.equal(registry.address)
    })

    it('cannot be initialize', async () => {
      await expect(implementation.initialize()).to.be.revertedWith('Initializable: contract is already initialized')
    })
  })

  describe('dependencies', () => {
    let instance: Contract, dependency: Contract, dependencyInitializeData: string

    beforeEach('create instance', async () => {
      await registry.connect(admin).register(await implementation.NAMESPACE(), implementation.address)
      const initializeData = implementation.interface.encodeFunctionData('initialize', [])
      const tx = await registry.clone(implementation.address, initializeData)
      const event = await assertEvent(tx, 'Cloned', { implementation })
      instance = await instanceAt('BaseImplementationMock', event.args.instance)
      expect(await registry.getImplementation(instance.address)).to.be.equal(implementation.address)
    })

    beforeEach('create dependency', async () => {
      dependency = await deploy('AuthorizedImplementationMock', [registry.address])
      dependencyInitializeData = dependency.interface.encodeFunctionData('initialize', [admin.address])
    })

    context('when the requested dependency implementation was registered', async () => {
      beforeEach('register dependency', async () => {
        await registry.connect(admin).register(await dependency.NAMESPACE(), dependency.address)
      })

      context('when the dependency was not set', async () => {
        it('can be set', async () => {
          const tx = await instance.setDependency(dependency.address, dependencyInitializeData)
          const event = await assertIndirectEvent(tx, registry.interface, 'Cloned', { implementation: dependency })

          expect(await instance.dependency()).to.be.equal(event.args.instance)
          expect(await registry.getImplementation(await instance.dependency())).to.be.equal(dependency.address)
        })
      })

      context('when the dependency was already set', async () => {
        beforeEach('set implementation', async () => {
          await implementation.setDependency(dependency.address, dependencyInitializeData)
        })

        context('when the requested dependency implementation is registered', async () => {
          context('when the requested implementation is registered with the same namespace', async () => {
            it('can be set', async () => {
              const previousDependency = await instance.dependency()

              const tx = await instance.setDependency(dependency.address, dependencyInitializeData)
              const event = await assertIndirectEvent(tx, registry.interface, 'Cloned', { implementation: dependency })

              const dependencyInstance = await instanceAt('AuthorizedImplementation', event.args.instance)
              expect(dependencyInstance.address).not.to.be.equal(previousDependency)
              expect(await instance.dependency()).to.be.equal(dependencyInstance.address)
              expect(await registry.getImplementation(dependencyInstance.address)).to.be.equal(dependency.address)

              const authorizeRole = dependencyInstance.interface.getSighash('authorize')
              expect(await dependencyInstance.isAuthorized(admin.address, authorizeRole)).to.be.true

              const unauthorizeRole = dependencyInstance.interface.getSighash('unauthorize')
              expect(await dependencyInstance.isAuthorized(admin.address, unauthorizeRole)).to.be.true
            })
          })

          context('when the requested implementation is registered with another namespace', async () => {
            let anotherDependency: Contract

            beforeEach('register another implementation', async () => {
              anotherDependency = await deploy('AuthorizedImplementationMock', [registry.address])
              await registry.connect(admin).register(ONES_BYTES32, anotherDependency.address)
            })

            it('reverts', async () => {
              await expect(
                implementation.setDependency(anotherDependency.address, dependencyInitializeData)
              ).to.be.revertedWith('INVALID_NEW_IMPL_NAMESPACE')
            })
          })
        })

        context('when the requested implementation is not registered', async () => {
          let anotherDependency: Contract

          beforeEach('register another implementation', async () => {
            anotherDependency = await deploy('AuthorizedImplementationMock', [registry.address])
          })

          it('reverts', async () => {
            await expect(
              implementation.setDependency(anotherDependency.address, dependencyInitializeData)
            ).to.be.revertedWith('NEW_IMPL_NOT_REGISTERED')
          })
        })
      })
    })

    context('when the requested dependency implementation was not registered', async () => {
      it('reverts', async () => {
        await expect(implementation.setDependency(dependency.address, dependencyInitializeData)).to.be.revertedWith(
          'UNREGISTERED_IMPLEMENTATION'
        )
      })
    })
  })
})
