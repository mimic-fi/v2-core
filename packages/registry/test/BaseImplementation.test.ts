import { deploy, getSigners } from '@mimic-fi/v2-helpers'
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
    dependency = await deploy('InitializableImplementationMock', [registry.address])
  })

  describe('validateStatelessDependency', () => {
    const itDoesNotRevert = () => {
      it('does not revert', async () => {
        await expect(sample.validateStatelessDependency(dependency.address)).not.to.be.reverted
      })
    }

    const itReverts = (reason: string) => {
      it('reverts', async () => {
        await expect(sample.validateStatelessDependency(dependency.address)).to.be.revertedWith(reason)
      })
    }

    context('when the dependency implementation is registered', async () => {
      context('when the dependency implementation is stateless', async () => {
        const stateless = true

        beforeEach('register dependency', async () => {
          await registry.connect(admin).register(await dependency.NAMESPACE(), dependency.address, stateless)
        })

        context('when the dependency implementation is not deprecated', async () => {
          itDoesNotRevert()
        })

        context('when the dependency implementation is deprecated', () => {
          beforeEach('deprecate dependency', async () => {
            await registry.connect(admin).deprecate(dependency.address)
          })

          itReverts('DEPENDENCY_DEPRECATED')
        })
      })

      context('when the dependency implementation is stateful', async () => {
        const stateless = false

        beforeEach('register dependency', async () => {
          await registry.connect(admin).register(await dependency.NAMESPACE(), dependency.address, stateless)
        })

        context('when the dependency implementation is not deprecated', async () => {
          itReverts('DEPENDENCY_NOT_STATELESS')
        })

        context('when the dependency implementation is deprecated', () => {
          beforeEach('deprecate dependency', async () => {
            await registry.connect(admin).deprecate(dependency.address)
          })

          itReverts('DEPENDENCY_DEPRECATED')
        })
      })
    })

    context('when the dependency implementation is not registered', async () => {
      itReverts('DEPENDENCY_NOT_REGISTERED')
    })
  })

  describe('validateStatefulDependency', () => {
    const itDoesNotRevert = () => {
      it('does not revert', async () => {
        await expect(sample.validateStatefulDependency(dependency.address)).not.to.be.reverted
      })
    }

    const itReverts = (reason: string) => {
      it('reverts', async () => {
        await expect(sample.validateStatefulDependency(dependency.address)).to.be.revertedWith(reason)
      })
    }

    context('when the dependency implementation is registered', async () => {
      context('when the dependency implementation is stateful', async () => {
        const stateless = false

        beforeEach('register dependency', async () => {
          await registry.connect(admin).register(await dependency.NAMESPACE(), dependency.address, stateless)
        })

        context('when the dependency implementation is not deprecated', async () => {
          itDoesNotRevert()
        })

        context('when the dependency implementation is deprecated', () => {
          beforeEach('deprecate dependency', async () => {
            await registry.connect(admin).deprecate(dependency.address)
          })

          itReverts('DEPENDENCY_DEPRECATED')
        })
      })

      context('when the dependency implementation is stateless', async () => {
        const stateless = true

        beforeEach('register dependency', async () => {
          await registry.connect(admin).register(await dependency.NAMESPACE(), dependency.address, stateless)
        })

        context('when the dependency implementation is not deprecated', async () => {
          itReverts('DEPENDENCY_NOT_STATEFUL')
        })

        context('when the dependency implementation is deprecated', () => {
          beforeEach('deprecate dependency', async () => {
            await registry.connect(admin).deprecate(dependency.address)
          })

          itReverts('DEPENDENCY_DEPRECATED')
        })
      })
    })

    context('when the dependency implementation is not registered', async () => {
      itReverts('DEPENDENCY_NOT_REGISTERED')
    })
  })
})
