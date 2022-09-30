import { assertEvent, deploy, getSigners, instanceAt, ONES_BYTES32, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

import { createClone } from '../'

/* eslint-disable no-secrets/no-secrets */

describe('BaseImplementation', () => {
  let instance: Contract, registry: Contract, admin: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin] = await getSigners()
  })

  beforeEach('deploy instance', async () => {
    registry = await deploy('Registry', [admin.address])
    instance = await deploy('BaseImplementationMock', [registry.address])
  })

  describe('validateDependency', () => {
    let dependency: Contract

    context('when the dependency is not set', async () => {
      context('when the new dependency implementation is registered', async () => {
        let implementation: Contract

        beforeEach('register new dependency implementation', async () => {
          implementation = await deploy('InitializableImplementationMock', [registry.address])
          await registry.connect(admin).register(await implementation.NAMESPACE(), implementation.address, true)
        })

        context('when the new dependency is an implementation', () => {
          beforeEach('set dependency', () => {
            dependency = implementation
          })

          context('when the new dependency implementation is not deprecated', async () => {
            it('can be set', async () => {
              await instance.setDependency(dependency.address)
              expect(await instance.dependency()).to.be.equal(dependency.address)
            })
          })

          context('when the new dependency implementation is deprecated', async () => {
            beforeEach('deprecate', async () => {
              await registry.connect(admin).deprecate(implementation.address)
            })

            it('reverts', async () => {
              await expect(instance.setDependency(dependency.address)).to.be.revertedWith('NEW_DEPENDENCY_DEPRECATED')
            })
          })
        })

        context('when the new dependency is an instance', () => {
          beforeEach('create dependency instance', async () => {
            const tx = await registry.clone(implementation.address, '0x')
            const event = await assertEvent(tx, 'Cloned', { implementation })
            dependency = await instanceAt('InitializableImplementationMock', event.args.instance)
          })

          context('when the new dependency implementation is not deprecated', async () => {
            it('can be set', async () => {
              await instance.setDependency(dependency.address)
              expect(await instance.dependency()).to.be.equal(dependency.address)
            })
          })

          context('when the new dependency implementation is deprecated', async () => {
            beforeEach('deprecate', async () => {
              await registry.connect(admin).deprecate(implementation.address)
            })

            it('reverts', async () => {
              await expect(instance.setDependency(dependency.address)).to.be.revertedWith('NEW_DEPENDENCY_DEPRECATED')
            })
          })
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
      context('when the current dependency is an instance', async () => {
        beforeEach('set dependency', async () => {
          const previousDependency = await createClone(
            registry,
            admin,
            'InitializableImplementationMock',
            [registry.address],
            []
          )
          await instance.setDependency(previousDependency.address)
        })

        context('when setting a new dependency', async () => {
          context('when the new dependency is registered', async () => {
            let implementation: Contract

            beforeEach('deploy implementation', async () => {
              implementation = await deploy('InitializableImplementationMock', [registry.address])
            })

            context('when the new dependency is registered with the same namespace', async () => {
              context('when the new dependency is registered with the same stateless condition', async () => {
                const stateless = false

                beforeEach('register implementation', async () => {
                  await registry
                    .connect(admin)
                    .register(await implementation.NAMESPACE(), implementation.address, stateless)
                })

                context('when the new dependency is an instance', async () => {
                  beforeEach('create dependency instance', async () => {
                    const tx = await registry.clone(implementation.address, '0x')
                    const event = await assertEvent(tx, 'Cloned', { implementation })
                    dependency = await instanceAt('InitializableImplementationMock', event.args.instance)
                  })

                  it('can be set', async () => {
                    await instance.setDependency(dependency.address)
                    expect(await instance.dependency()).to.be.equal(dependency.address)
                  })
                })

                context('when the new dependency is an implementation', async () => {
                  beforeEach('set dependency', () => {
                    dependency = implementation
                  })

                  it('reverts', async () => {
                    await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                      'NEW_DEPENDENCY_MUST_BE_INSTANCE'
                    )
                  })
                })
              })

              context('when the new dependency is registered with another stateless condition', async () => {
                const stateless = true

                beforeEach('register implementation', async () => {
                  await registry
                    .connect(admin)
                    .register(await implementation.NAMESPACE(), implementation.address, stateless)
                })

                context('when the new dependency is an instance', async () => {
                  beforeEach('create dependency instance', async () => {
                    const tx = await registry.clone(implementation.address, '0x')
                    const event = await assertEvent(tx, 'Cloned', { implementation })
                    dependency = await instanceAt('InitializableImplementationMock', event.args.instance)
                  })

                  it('reverts', async () => {
                    await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                      'INVALID_NEW_DEPENDENCY_STATELESS'
                    )
                  })
                })

                context('when the new dependency is an implementation', async () => {
                  beforeEach('set dependency', () => {
                    dependency = implementation
                  })

                  it('reverts', async () => {
                    await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                      'NEW_DEPENDENCY_MUST_BE_INSTANCE'
                    )
                  })
                })
              })
            })

            context('when the new dependency is registered with another namespace', async () => {
              const ANOTHER_NAMESPACE = ONES_BYTES32

              context('when the new dependency is registered with the same stateless condition', async () => {
                const stateless = false

                beforeEach('register implementation', async () => {
                  await registry.connect(admin).register(ANOTHER_NAMESPACE, implementation.address, stateless)
                })

                context('when the new dependency is an instance', async () => {
                  beforeEach('create dependency instance', async () => {
                    const tx = await registry.clone(implementation.address, '0x')
                    const event = await assertEvent(tx, 'Cloned', { implementation })
                    dependency = await instanceAt('InitializableImplementationMock', event.args.instance)
                  })

                  it('reverts', async () => {
                    await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                      'INVALID_NEW_DEPENDENCY_NAMESPACE'
                    )
                  })
                })

                context('when the new dependency is an implementation', async () => {
                  beforeEach('set dependency', () => {
                    dependency = implementation
                  })

                  it('reverts', async () => {
                    await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                      'NEW_DEPENDENCY_MUST_BE_INSTANCE'
                    )
                  })
                })
              })

              context('when the new dependency is registered with another stateless condition', async () => {
                const stateless = true

                beforeEach('register implementation', async () => {
                  await registry.connect(admin).register(ANOTHER_NAMESPACE, implementation.address, stateless)
                })

                context('when the new dependency is an instance', async () => {
                  beforeEach('create dependency instance', async () => {
                    const tx = await registry.clone(implementation.address, '0x')
                    const event = await assertEvent(tx, 'Cloned', { implementation })
                    dependency = await instanceAt('InitializableImplementationMock', event.args.instance)
                  })

                  it('reverts', async () => {
                    await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                      'INVALID_NEW_DEPENDENCY_NAMESPACE'
                    )
                  })
                })

                context('when the new dependency is an implementation', async () => {
                  beforeEach('set dependency', () => {
                    dependency = implementation
                  })

                  it('reverts', async () => {
                    await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                      'NEW_DEPENDENCY_MUST_BE_INSTANCE'
                    )
                  })
                })
              })
            })
          })

          context('when the new dependency is not registered', async () => {
            beforeEach('create new dependency', async () => {
              dependency = await deploy('InitializableImplementationMock', [registry.address])
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

      context('when the current dependency is an implementation', async () => {
        beforeEach('set dependency', async () => {
          const previousDependency = await deploy('InitializableImplementationMock', [registry.address])
          await registry.connect(admin).register(await previousDependency.NAMESPACE(), previousDependency.address, true)
          await instance.setDependency(previousDependency.address)
        })

        context('when setting a new dependency', async () => {
          context('when the new dependency is registered', async () => {
            let implementation: Contract

            beforeEach('deploy implementation', async () => {
              implementation = await deploy('InitializableImplementationMock', [registry.address])
            })

            context('when the new dependency is registered with the same namespace', async () => {
              context('when the new dependency is registered with the same stateless condition', async () => {
                const stateless = true

                beforeEach('register implementation', async () => {
                  await registry
                    .connect(admin)
                    .register(await implementation.NAMESPACE(), implementation.address, stateless)
                })

                context('when the new dependency is an instance', async () => {
                  beforeEach('create dependency instance', async () => {
                    const tx = await registry.clone(implementation.address, '0x')
                    const event = await assertEvent(tx, 'Cloned', { implementation })
                    dependency = await instanceAt('InitializableImplementationMock', event.args.instance)
                  })

                  it('reverts', async () => {
                    await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                      'NEW_DEPENDENCY_MUST_BE_IMPL'
                    )
                  })
                })

                context('when the new dependency is an implementation', async () => {
                  beforeEach('set dependency', () => {
                    dependency = implementation
                  })

                  it('can be set', async () => {
                    await instance.setDependency(dependency.address)
                    expect(await instance.dependency()).to.be.equal(dependency.address)
                  })
                })
              })

              context('when the new dependency is registered with another stateless condition', async () => {
                const stateless = false

                beforeEach('register implementation', async () => {
                  await registry
                    .connect(admin)
                    .register(await implementation.NAMESPACE(), implementation.address, stateless)
                })

                context('when the new dependency is an instance', async () => {
                  beforeEach('create dependency instance', async () => {
                    const tx = await registry.clone(implementation.address, '0x')
                    const event = await assertEvent(tx, 'Cloned', { implementation })
                    dependency = await instanceAt('InitializableImplementationMock', event.args.instance)
                  })

                  it('reverts', async () => {
                    await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                      'NEW_DEPENDENCY_MUST_BE_IMPL'
                    )
                  })
                })

                context('when the new dependency is an implementation', async () => {
                  beforeEach('set dependency', () => {
                    dependency = implementation
                  })

                  it('reverts', async () => {
                    await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                      'INVALID_NEW_DEPENDENCY_STATELESS'
                    )
                  })
                })
              })
            })

            context('when the new dependency is registered with another namespace', async () => {
              const ANOTHER_NAMESPACE = ONES_BYTES32

              context('when the new dependency is registered with the same stateless condition', async () => {
                const stateless = true

                beforeEach('register implementation', async () => {
                  await registry.connect(admin).register(ANOTHER_NAMESPACE, implementation.address, stateless)
                })

                context('when the new dependency is an instance', async () => {
                  beforeEach('create dependency instance', async () => {
                    const tx = await registry.clone(implementation.address, '0x')
                    const event = await assertEvent(tx, 'Cloned', { implementation })
                    dependency = await instanceAt('InitializableImplementationMock', event.args.instance)
                  })

                  it('reverts', async () => {
                    await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                      'NEW_DEPENDENCY_MUST_BE_IMPL'
                    )
                  })
                })

                context('when the new dependency is an implementation', async () => {
                  beforeEach('set dependency', () => {
                    dependency = implementation
                  })

                  it('reverts', async () => {
                    await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                      'INVALID_NEW_DEPENDENCY_NAMESPACE'
                    )
                  })
                })
              })

              context('when the new dependency is registered with another stateless condition', async () => {
                const stateless = false

                beforeEach('register implementation', async () => {
                  await registry.connect(admin).register(ANOTHER_NAMESPACE, implementation.address, stateless)
                })

                context('when the new dependency is an instance', async () => {
                  beforeEach('create dependency instance', async () => {
                    const tx = await registry.clone(implementation.address, '0x')
                    const event = await assertEvent(tx, 'Cloned', { implementation })
                    dependency = await instanceAt('InitializableImplementationMock', event.args.instance)
                  })

                  it('reverts', async () => {
                    await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                      'NEW_DEPENDENCY_MUST_BE_IMPL'
                    )
                  })
                })

                context('when the new dependency is an implementation', async () => {
                  beforeEach('set dependency', () => {
                    dependency = implementation
                  })

                  it('reverts', async () => {
                    await expect(instance.setDependency(dependency.address)).to.be.revertedWith(
                      'INVALID_NEW_DEPENDENCY_NAMESPACE'
                    )
                  })
                })
              })
            })
          })

          context('when the new dependency is not registered', async () => {
            beforeEach('create new dependency', async () => {
              dependency = await deploy('InitializableImplementationMock', [registry.address])
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
