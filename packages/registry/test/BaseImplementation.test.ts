import { assertEvent, deploy, getSigners, instanceAt, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

import { createClone } from '../'

/* eslint-disable no-secrets/no-secrets */

describe('BaseImplementation', () => {
  let registry: Contract, admin: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin] = await getSigners()
  })

  beforeEach('deploy registry', async () => {
    registry = await deploy('Registry', [admin.address])
  })

  describe('initialize', () => {
    let implementation: Contract

    beforeEach('deploy implementation', async () => {
      implementation = await deploy('BaseImplementationMock', [registry.address])
    })

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

          const instance = await instanceAt('BaseImplementationMock', event.args.instance)
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

  describe('validateDependency', () => {
    let instance: Contract, dependency: Contract

    beforeEach('register and create sample instance', async () => {
      instance = await createClone(registry, admin, 'BaseImplementationMock', [registry.address], [])
    })

    context('when the dependency is not set', async () => {
      context('when the new dependency implementation is registered', async () => {
        beforeEach('register and create new dependency', async () => {
          dependency = await createClone(registry, admin, 'BaseImplementationMock', [registry.address], [])
        })

        it('can be set', async () => {
          await instance.setDependency(dependency.address)
          expect(await instance.dependency()).to.be.equal(dependency.address)
        })
      })

      context('when the new dependency implementation is not registered', async () => {
        beforeEach('create new dependency', async () => {
          dependency = await deploy('BaseImplementationMock', [registry.address])
        })

        it('reverts', async () => {
          await expect(instance.setDependency(dependency.address)).to.be.revertedWith('NEW_DEPENDENCY_NOT_REGISTERED')
        })
      })
    })

    context('when the dependency is already set', async () => {
      context('when the dependency is an instance', async () => {
        beforeEach('set dependency', async () => {
          const previousDependency = await createClone(
            registry,
            admin,
            'BaseImplementationMock',
            [registry.address],
            []
          )
          await instance.setDependency(previousDependency.address)
        })

        context('when setting a new dependency', async () => {
          context('when the new dependency is registered', async () => {
            context('when the new dependency is registered as an instance', async () => {
              context('when the new dependency is registered with the same namespace', async () => {
                beforeEach('register and create dependency', async () => {
                  dependency = await createClone(registry, admin, 'BaseImplementationMock', [registry.address], [])
                })

                it('can be set', async () => {
                  await instance.setDependency(dependency.address)
                  expect(await instance.dependency()).to.be.equal(dependency.address)
                })
              })

              context('when the new dependency is registered with another namespace', async () => {
                beforeEach('register and create dependency instance', async () => {
                  dependency = await createClone(
                    registry,
                    admin,
                    'AuthorizedImplementationMock',
                    [registry.address],
                    [admin.address]
                  )
                })

                it('reverts', async () => {
                  await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                    'INVALID_NEW_DEPENDENCY_NAMESPACE'
                  )
                })
              })
            })

            context('when the new dependency is registered as an implementation', async () => {
              context('when the new dependency is registered with the same namespace', async () => {
                beforeEach('register and create dependency', async () => {
                  dependency = await deploy('BaseImplementationMock', [registry.address])
                  await registry.connect(admin).register(await dependency.NAMESPACE(), dependency.address)
                })

                it('reverts', async () => {
                  await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                    'NEW_DEPENDENCY_MUST_BE_INSTANCE'
                  )
                })
              })

              context('when the new dependency is registered with another namespace', async () => {
                beforeEach('register and create dependency', async () => {
                  dependency = await deploy('AuthorizedImplementationMock', [registry.address])
                  await registry.connect(admin).register(await dependency.NAMESPACE(), dependency.address)
                })

                it('reverts', async () => {
                  await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                    'NEW_DEPENDENCY_MUST_BE_INSTANCE'
                  )
                })
              })
            })
          })

          context('when the new dependency is not registered', async () => {
            beforeEach('create new dependency', async () => {
              dependency = await deploy('BaseImplementationMock', [registry.address])
            })

            it('reverts', async () => {
              await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                'NEW_DEPENDENCY_NOT_REGISTERED'
              )
            })
          })
        })

        context('when unsetting the current dependency', () => {
          it('reverts', async () => {
            await expect(instance.setDependency(ZERO_ADDRESS)).to.be.revertedWith('NEW_DEPENDENCY_NOT_REGISTERED')
          })
        })
      })

      context('when the dependency is an implementation', async () => {
        beforeEach('set dependency', async () => {
          const previousDependency = await deploy('BaseImplementationMock', [registry.address])
          await registry.connect(admin).register(await previousDependency.NAMESPACE(), previousDependency.address)
          await instance.setDependency(previousDependency.address)
        })

        context('when setting a new dependency', async () => {
          context('when the new dependency is registered', async () => {
            context('when the new dependency is registered as an implementation', async () => {
              context('when the new dependency is registered with the same namespace', async () => {
                beforeEach('register and create dependency', async () => {
                  dependency = await deploy('BaseImplementationMock', [registry.address])
                  await registry.connect(admin).register(await dependency.NAMESPACE(), dependency.address)
                })

                it('can be set', async () => {
                  await instance.setDependency(dependency.address)
                  expect(await instance.dependency()).to.be.equal(dependency.address)
                })
              })

              context('when the new dependency is registered with another namespace', async () => {
                beforeEach('register and create dependency', async () => {
                  dependency = await deploy('AuthorizedImplementationMock', [registry.address])
                  await registry.connect(admin).register(await dependency.NAMESPACE(), dependency.address)
                })

                it('reverts', async () => {
                  await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                    'INVALID_NEW_DEPENDENCY_NAMESPACE'
                  )
                })
              })
            })

            context('when the new dependency is registered as an instance', async () => {
              context('when the new dependency is registered with the same namespace', async () => {
                beforeEach('register and create dependency', async () => {
                  dependency = await createClone(registry, admin, 'BaseImplementationMock', [registry.address], [])
                })

                it('reverts', async () => {
                  await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                    'NEW_DEPENDENCY_MUST_BE_IMPL'
                  )
                })
              })

              context('when the new dependency is registered with another namespace', async () => {
                beforeEach('register and create dependency', async () => {
                  dependency = await createClone(
                    registry,
                    admin,
                    'AuthorizedImplementationMock',
                    [registry.address],
                    [admin.address]
                  )
                })

                it('reverts', async () => {
                  await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                    'NEW_DEPENDENCY_MUST_BE_IMPL'
                  )
                })
              })
            })
          })

          context('when the new dependency is not registered', async () => {
            beforeEach('create new dependency', async () => {
              dependency = await deploy('BaseImplementationMock', [registry.address])
            })

            it('reverts', async () => {
              await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                'NEW_DEPENDENCY_NOT_REGISTERED'
              )
            })
          })
        })

        context('when unsetting the current dependency', () => {
          it('reverts', async () => {
            await expect(instance.setDependency(ZERO_ADDRESS)).to.be.revertedWith('NEW_DEPENDENCY_NOT_REGISTERED')
          })
        })
      })
    })
  })
})
