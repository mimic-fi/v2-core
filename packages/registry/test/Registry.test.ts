import {
  assertEvent,
  deploy,
  getSigners,
  instanceAt,
  itBehavesLikeAuthorizer,
  ZERO_BYTES32,
} from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

describe('Registry', () => {
  let registry: Contract, implementation: Contract
  let admin: SignerWithAddress, other: SignerWithAddress

  const NAMESPACE = '0x0000000000000000000000000000000000000000000000000000000000000001'

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin, other] = await getSigners()
  })

  beforeEach('create registry', async () => {
    registry = await deploy('Registry', [admin.address])
    implementation = await deploy('InitializableImplementationMock', [registry.address])
  })

  describe('initialization', () => {
    it('authorizes the admin to register', async () => {
      const registerRole = registry.interface.getSighash('register')

      expect(await registry.isAuthorized(admin.address, registerRole)).to.be.true
      expect(await registry.isAuthorized(other.address, registerRole)).to.be.false
    })

    it('authorizes the admin to deprecate', async () => {
      const deprecateRole = registry.interface.getSighash('deprecate')

      expect(await registry.isAuthorized(admin.address, deprecateRole)).to.be.true
      expect(await registry.isAuthorized(other.address, deprecateRole)).to.be.false
    })

    it('authorizes the admin to authorize', async () => {
      const authorizeRole = registry.interface.getSighash('authorize')

      expect(await registry.isAuthorized(admin.address, authorizeRole)).to.be.true
      expect(await registry.isAuthorized(other.address, authorizeRole)).to.be.false
    })

    it('authorizes the admin to unauthorize', async () => {
      const unauthorizeRole = registry.interface.getSighash('unauthorize')

      expect(await registry.isAuthorized(admin.address, unauthorizeRole)).to.be.true
      expect(await registry.isAuthorized(other.address, unauthorizeRole)).to.be.false
    })
  })

  describe('authorizer', () => {
    beforeEach('setup authorizer tests', async function () {
      this.admin = admin
      this.authorizer = registry
    })

    itBehavesLikeAuthorizer()
  })

  describe('register', () => {
    const stateless = true

    context('when the sender is authorized', () => {
      beforeEach('set sender', () => {
        registry = registry.connect(admin)
      })

      context('when the requested implementation is not registered', () => {
        it('registers the requested implementation', async () => {
          await registry.register(NAMESPACE, implementation.address, stateless)

          const implementationData = await registry.implementationData(implementation.address)
          expect(implementationData.stateless).to.be.equal(stateless)
          expect(implementationData.deprecated).to.be.equal(false)
          expect(implementationData.namespace).to.be.equal(NAMESPACE)
        })

        it('emits an event', async () => {
          const tx = await registry.register(NAMESPACE, implementation.address, stateless)

          await assertEvent(tx, 'Registered', { namespace: NAMESPACE, implementation, stateless })
        })
      })

      context('when the requested implementation is registered', () => {
        beforeEach('register', async () => {
          await registry.register(NAMESPACE, implementation.address, stateless)
        })

        context('when the implementation is not deprecated', () => {
          it('reverts', async () => {
            await expect(registry.register(NAMESPACE, implementation.address, stateless)).to.be.revertedWith(
              'REGISTERED_IMPLEMENTATION'
            )
          })
        })

        context('when the implementation is deprecated', () => {
          beforeEach('register', async () => {
            await registry.deprecate(implementation.address)
          })

          it('reverts', async () => {
            await expect(registry.register(NAMESPACE, implementation.address, stateless)).to.be.revertedWith(
              'REGISTERED_IMPLEMENTATION'
            )
          })
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        registry = registry.connect(other)
      })

      it('reverts', async () => {
        await expect(registry.register(NAMESPACE, implementation.address, stateless)).to.be.revertedWith(
          'AUTH_SENDER_NOT_ALLOWED'
        )
      })
    })
  })

  describe('deprecate', () => {
    context('when the sender is authorized', () => {
      beforeEach('set sender', () => {
        registry = registry.connect(admin)
      })

      context('when the implementation is registered', () => {
        beforeEach('register', async () => {
          await registry.register(NAMESPACE, implementation.address, true)
        })

        context('when the implementation is not deprecated', () => {
          it('deprecates the requested implementation', async () => {
            const previousData = await registry.implementationData(implementation.address)

            await registry.deprecate(implementation.address)

            const currentData = await registry.implementationData(implementation.address)
            expect(currentData.stateless).to.be.equal(previousData.stateless)
            expect(currentData.deprecated).to.be.equal(true)
            expect(currentData.namespace).to.be.equal(previousData.namespace)
          })

          it('emits an event', async () => {
            const tx = await registry.deprecate(implementation.address)

            await assertEvent(tx, 'Deprecated', { namespace: NAMESPACE, implementation })
          })
        })

        context('when the implementation is deprecated', () => {
          beforeEach('deprecate', async () => {
            await registry.deprecate(implementation.address)
          })

          it('reverts', async () => {
            await expect(registry.deprecate(implementation.address)).to.be.revertedWith('DEPRECATED_IMPLEMENTATION')
          })
        })
      })

      context('when the implementation is not registered', () => {
        it('reverts', async () => {
          await expect(registry.deprecate(implementation.address)).to.be.revertedWith('UNREGISTERED_IMPLEMENTATION')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        registry = registry.connect(other)
      })

      it('reverts', async () => {
        await expect(registry.deprecate(implementation.address)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('clone', () => {
    let initializeData: string

    before('build initialize data', () => {
      initializeData = implementation.interface.encodeFunctionData('initialize', [])
    })

    context('when the implementation is registered', () => {
      beforeEach('register', async () => {
        await registry.connect(admin).register(NAMESPACE, implementation.address, true)
      })

      context('when the implementation is registered with another namespace', () => {
        context('when the implementation is not deprecated', () => {
          it('cannot be cloned', async () => {
            await expect(registry.clone(implementation.address, initializeData)).to.be.revertedWith(
              'INVALID_IMPLEMENTATION_NAMESPACE'
            )
          })
        })

        context('when the implementation is deprecated', () => {
          beforeEach('deprecate', async () => {
            await registry.connect(admin).deprecate(implementation.address)
          })

          it('reverts', async () => {
            await expect(registry.clone(implementation.address, initializeData)).to.be.revertedWith(
              'DEPRECATED_IMPLEMENTATION'
            )
          })
        })
      })

      context('when the implementation is registered with the correct namespace', () => {
        let namespace: string

        beforeEach('deploy another implementation and register', async () => {
          implementation = await deploy('InitializableImplementationMock', [registry.address])
          namespace = await implementation.NAMESPACE()
          await registry.connect(admin).register(namespace, implementation.address, true)
        })

        context('when the implementation is not deprecated', () => {
          let instance: Contract

          beforeEach('clone', async () => {
            const tx = await registry.clone(implementation.address, initializeData)
            const { args } = await assertEvent(tx, 'Cloned', { namespace, implementation })
            instance = await instanceAt('InitializableImplementationMock', args.instance)
          })

          it('clones the implementation properly', async () => {
            expect(await instance.registry()).to.be.equal(registry.address)
            expect(await instance.NAMESPACE()).to.be.equal(namespace)
            expect(await registry.implementationOf(instance.address)).to.be.equal(implementation.address)
          })

          it('initializes the new instance', async () => {
            await expect(instance.initialize()).to.be.revertedWith('Initializable: contract is already initialized')
          })

          it('does not register the instance', async () => {
            const implementationData = await registry.implementationData(instance.address)
            expect(implementationData.stateless).to.be.equal(false)
            expect(implementationData.deprecated).to.be.equal(false)
            expect(implementationData.namespace).to.be.equal(ZERO_BYTES32)
          })

          it('cannot be registered', async () => {
            await expect(registry.connect(admin).register(namespace, instance.address, true)).to.be.revertedWith(
              'CANNOT_REGISTER_INSTANCE'
            )
          })
        })

        context('when the implementation is deprecated', () => {
          beforeEach('deprecate', async () => {
            await registry.connect(admin).deprecate(implementation.address)
          })

          it('reverts', async () => {
            await expect(registry.clone(implementation.address, initializeData)).to.be.revertedWith(
              'DEPRECATED_IMPLEMENTATION'
            )
          })
        })
      })
    })

    context('when the implementation is not registered', () => {
      it('reverts', async () => {
        await expect(registry.clone(implementation.address, initializeData)).to.be.revertedWith(
          'UNREGISTERED_IMPLEMENTATION'
        )
      })
    })
  })
})
