import { assertEvent, deploy, getSigners, instanceAt } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

/* eslint-disable no-secrets/no-secrets */

describe('BaseImplementation', () => {
  let sample: Contract, dependency: Contract, registry: Contract, admin: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin] = await getSigners()
  })

  beforeEach('deploy instance', async () => {
    registry = await deploy('Registry', [admin.address])
    sample = await deploy('BaseImplementationMock', [registry.address])
  })

  const setupDependency = async (instance: boolean, stateless: boolean, deprecated: boolean): Promise<void> => {
    const implementation = await deploy('InitializableImplementationMock', [registry.address])
    await registry.connect(admin).register(await implementation.NAMESPACE(), implementation.address, stateless)

    if (!instance) dependency = implementation
    else {
      const tx = await registry.clone(implementation.address, '0x')
      const event = await assertEvent(tx, 'Cloned', { implementation })
      dependency = await instanceAt('InitializableImplementationMock', event.args.instance)
    }

    if (deprecated) await registry.connect(admin).deprecate(implementation.address)
  }

  describe('validateStatelessDependency', () => {
    const itReverts = (instance: boolean, stateless: boolean, deprecated: boolean, reason: string) => {
      it('reverts', async () => {
        await setupDependency(instance, stateless, deprecated)
        await expect(sample.validateStatelessDependency(dependency.address)).to.be.revertedWith(reason)
      })
    }

    const itDoesNotRevert = (instance: boolean, stateless: boolean, deprecated: boolean) => {
      it('does not revert', async () => {
        await setupDependency(instance, stateless, deprecated)
        await expect(sample.validateStatelessDependency(dependency.address)).not.to.be.reverted
      })
    }

    context('when the dependency implementation is registered', async () => {
      context('when the dependency implementation is stateless', async () => {
        const stateless = true

        context('when the dependency implementation is not deprecated', async () => {
          const deprecated = false

          context('when the dependency is an implementation', async () => {
            const instance = false

            itDoesNotRevert(instance, stateless, deprecated)
          })

          context('when the dependency is an instance', async () => {
            const instance = true

            itDoesNotRevert(instance, stateless, deprecated)
          })
        })

        context('when the dependency implementation is deprecated', () => {
          const deprecated = true

          context('when the dependency is an implementation', async () => {
            const instance = false

            itReverts(instance, stateless, deprecated, 'DEPENDENCY_DEPRECATED')
          })

          context('when the dependency is an instance', async () => {
            const instance = true

            itReverts(instance, stateless, deprecated, 'DEPENDENCY_DEPRECATED')
          })
        })
      })

      context('when the dependency implementation is stateful', async () => {
        const stateless = false

        context('when the dependency implementation is not deprecated', async () => {
          const deprecated = false

          context('when the dependency is an implementation', async () => {
            const instance = false

            itReverts(instance, stateless, deprecated, 'DEPENDENCY_NOT_STATELESS')
          })

          context('when the dependency is an instance', async () => {
            const instance = true

            itReverts(instance, stateless, deprecated, 'DEPENDENCY_NOT_STATELESS')
          })
        })

        context('when the dependency implementation is deprecated', () => {
          const deprecated = true

          context('when the dependency is an implementation', async () => {
            const instance = false

            itReverts(instance, stateless, deprecated, 'DEPENDENCY_DEPRECATED')
          })

          context('when the dependency is an instance', async () => {
            const instance = true

            itReverts(instance, stateless, deprecated, 'DEPENDENCY_DEPRECATED')
          })
        })
      })
    })

    context('when the dependency implementation is not registered', async () => {
      it('reverts', async () => {
        const implementation = await deploy('InitializableImplementationMock', [registry.address])
        await expect(sample.validateStatelessDependency(implementation.address)).to.be.revertedWith(
          'DEPENDENCY_NOT_REGISTERED'
        )
      })
    })
  })

  describe('validateStatefulDependency', () => {
    const itReverts = (instance: boolean, stateless: boolean, deprecated: boolean, reason: string) => {
      it('reverts', async () => {
        await setupDependency(instance, stateless, deprecated)
        await expect(sample.validateStatefulDependency(dependency.address)).to.be.revertedWith(reason)
      })
    }

    const itDoesNotRevert = (instance: boolean, stateless: boolean, deprecated: boolean) => {
      it('does not revert', async () => {
        await setupDependency(instance, stateless, deprecated)
        await expect(sample.validateStatefulDependency(dependency.address)).not.to.be.reverted
      })
    }

    context('when the dependency implementation is registered', async () => {
      context('when the dependency implementation is stateful', async () => {
        const stateless = false

        context('when the dependency implementation is not deprecated', async () => {
          const deprecated = false

          context('when the dependency is an implementation', async () => {
            const instance = false

            itDoesNotRevert(instance, stateless, deprecated)
          })

          context('when the dependency is an instance', async () => {
            const instance = true

            itDoesNotRevert(instance, stateless, deprecated)
          })
        })

        context('when the dependency implementation is deprecated', () => {
          const deprecated = true

          context('when the dependency is an implementation', async () => {
            const instance = false

            itReverts(instance, stateless, deprecated, 'DEPENDENCY_DEPRECATED')
          })

          context('when the dependency is an instance', async () => {
            const instance = true

            itReverts(instance, stateless, deprecated, 'DEPENDENCY_DEPRECATED')
          })
        })
      })

      context('when the dependency implementation is stateless', async () => {
        const stateless = true

        context('when the dependency implementation is not deprecated', async () => {
          const deprecated = false

          context('when the dependency is an implementation', async () => {
            const instance = false

            itReverts(instance, stateless, deprecated, 'DEPENDENCY_NOT_STATEFUL')
          })

          context('when the dependency is an instance', async () => {
            const instance = true

            itReverts(instance, stateless, deprecated, 'DEPENDENCY_NOT_STATEFUL')
          })
        })

        context('when the dependency implementation is deprecated', () => {
          const deprecated = true

          context('when the dependency is an implementation', async () => {
            const instance = false

            itReverts(instance, stateless, deprecated, 'DEPENDENCY_DEPRECATED')
          })

          context('when the dependency is an instance', async () => {
            const instance = true

            itReverts(instance, stateless, deprecated, 'DEPENDENCY_DEPRECATED')
          })
        })
      })
    })

    context('when the dependency implementation is not registered', async () => {
      it('reverts', async () => {
        const implementation = await deploy('InitializableImplementationMock', [registry.address])
        await expect(sample.validateStatefulDependency(implementation.address)).to.be.revertedWith(
          'DEPENDENCY_NOT_REGISTERED'
        )
      })
    })
  })
})
