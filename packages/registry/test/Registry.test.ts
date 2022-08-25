import { assertEvent, deploy, getSigners, instanceAt } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

describe('Registry', () => {
  let registry: Contract
  let admin: SignerWithAddress, other: SignerWithAddress
  let implementation: Contract, anotherImplementation: Contract

  const NAMESPACE = '0x0000000000000000000000000000000000000000000000000000000000000001'
  const ANOTHER_NAMESPACE = '0x0000000000000000000000000000000000000000000000000000000000000002'

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin, other] = await getSigners()
  })

  beforeEach('create registry', async () => {
    registry = await deploy('Registry', [admin.address])
    implementation = await deploy('BaseImplementationMock', [registry.address])
    anotherImplementation = await deploy('BaseImplementationMock', [registry.address])
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

  describe('register', () => {
    context('when the sender is authorized', () => {
      beforeEach('set sender', () => {
        registry = registry.connect(admin)
      })

      context('when the requested implementation is not registered', () => {
        it('registers the requested implementation', async () => {
          await registry.register(NAMESPACE, implementation.address)

          expect(await registry.getNamespace(implementation.address)).to.be.equal(NAMESPACE)
          expect(await registry.getImplementation(implementation.address)).to.be.equal(implementation.address)

          expect(await registry.isActive(implementation.address)).to.be.true
          expect(await registry.isRegistered(NAMESPACE, implementation.address)).to.be.true

          expect(await registry.isRegistered(ANOTHER_NAMESPACE, implementation.address)).to.be.false
          expect(await registry.isRegistered(NAMESPACE, anotherImplementation.address)).to.be.false
        })

        it('emits an event', async () => {
          const tx = await registry.register(NAMESPACE, implementation.address)

          await assertEvent(tx, 'Registered', { namespace: NAMESPACE, implementation })
        })
      })

      context('when the requested implementation is registered', () => {
        beforeEach('register', async () => {
          await registry.register(NAMESPACE, implementation.address)
        })

        context('when the implementation is not deprecated', () => {
          it('reverts', async () => {
            await expect(registry.register(NAMESPACE, implementation.address)).to.be.revertedWith(
              'REGISTERED_IMPLEMENTATION'
            )
          })
        })

        context('when the implementation is deprecated', () => {
          beforeEach('register', async () => {
            await registry.deprecate(implementation.address)
          })

          it('reverts', async () => {
            await expect(registry.register(NAMESPACE, implementation.address)).to.be.revertedWith(
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
        await expect(registry.register(NAMESPACE, implementation.address)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
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
          await registry.register(NAMESPACE, implementation.address)
        })

        context('when the implementation is not deprecated', () => {
          it('deprecates the requested implementation', async () => {
            await registry.deprecate(implementation.address)

            expect(await registry.getNamespace(implementation.address)).to.be.equal(NAMESPACE)
            expect(await registry.getImplementation(implementation.address)).to.be.equal(implementation.address)
            expect(await registry.isRegistered(NAMESPACE, implementation.address)).to.be.false

            expect(await registry.isRegistered(ANOTHER_NAMESPACE, implementation.address)).to.be.false
            expect(await registry.isRegistered(NAMESPACE, anotherImplementation.address)).to.be.false
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
        await registry.connect(admin).register(NAMESPACE, implementation.address)
      })

      context('when the implementation is registered with another namespace', () => {
        context('when the implementation is not deprecated', () => {
          it('cannot be cloned', async () => {
            await expect(registry.clone(implementation.address, initializeData)).to.be.revertedWith(
              'INVALID_NEW_IMPL_NAMESPACE'
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
          implementation = await deploy('BaseImplementationMock', [registry.address])
          namespace = await implementation.NAMESPACE()
          await registry.connect(admin).register(namespace, implementation.address)
        })

        context('when the implementation is not deprecated', () => {
          let instance: Contract

          beforeEach('clone', async () => {
            const tx = await registry.clone(implementation.address, initializeData)
            const { args } = await assertEvent(tx, 'Cloned', { namespace, implementation })
            instance = await instanceAt('BaseImplementationMock', args.instance)
          })

          it('clones the implementation properly', async () => {
            expect(await instance.registry()).to.be.equal(registry.address)
            expect(await instance.NAMESPACE()).to.be.equal(namespace)
            expect(await registry.getImplementation(instance.address)).to.be.equal(implementation.address)
          })

          it('initializes the new instance', async () => {
            await expect(instance.initialize()).to.be.revertedWith('Initializable: contract is already initialized')
          })

          it('does not mark it as registered nor active', async () => {
            expect(await registry.isActive(instance.address)).to.be.false
            expect(await registry.isRegistered(namespace, instance.address)).to.be.false
          })

          it('cannot be registered', async () => {
            await expect(registry.connect(admin).register(namespace, instance.address)).to.be.revertedWith(
              'CANNOT_REGISTER_CLONE'
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
