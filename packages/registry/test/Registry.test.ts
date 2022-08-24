import { assertEvent, deploy, getSigners, instanceAt, ONES_BYTES32 } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

describe('Registry', () => {
  let registry: Contract
  let admin: SignerWithAddress, other: SignerWithAddress
  let implementation: string, anotherImplementation: string

  const namespace = '0x0000000000000000000000000000000000000000000000000000000000000001'
  const anotherNamespace = '0x0000000000000000000000000000000000000000000000000000000000000002'

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin, other] = await getSigners()
  })

  beforeEach('create registry', async () => {
    registry = await deploy('Registry', [admin.address])
    implementation = (await deploy('ImplementationMock', [registry.address])).address
    anotherImplementation = (await deploy('ImplementationMock', [registry.address])).address
  })

  describe('initialization', () => {
    it('authorizes the admin to register', async () => {
      const registerRole = registry.interface.getSighash('register')

      expect(await registry.isAuthorized(admin.address, registerRole)).to.be.true
      expect(await registry.isAuthorized(other.address, registerRole)).to.be.false
    })

    it('authorizes the admin to unregister', async () => {
      const unregisterRole = registry.interface.getSighash('unregister')

      expect(await registry.isAuthorized(admin.address, unregisterRole)).to.be.true
      expect(await registry.isAuthorized(other.address, unregisterRole)).to.be.false
    })

    it('authorizes the admin to authorize', async () => {
      const authorizeRole = registry.interface.getSighash('authorize')

      expect(await registry.isAuthorized(admin.address, authorizeRole)).to.be.true
      expect(await registry.isAuthorized(other.address, authorizeRole)).to.be.false
    })

    it('authorizes the admin to unregister', async () => {
      const unauthorizeRole = registry.interface.getSighash('unauthorize')

      expect(await registry.isAuthorized(admin.address, unauthorizeRole)).to.be.true
      expect(await registry.isAuthorized(other.address, unauthorizeRole)).to.be.false
    })
  })

  describe('register', () => {
    context('when the sender can register', () => {
      beforeEach('set sender', () => {
        registry = registry.connect(admin)
      })

      context('when the requested implementation is not registered', () => {
        it('registers the requested implementation', async () => {
          await registry.register(namespace, implementation)

          expect(await registry.getNamespace(implementation)).to.be.equal(namespace)
          expect(await registry.isRegistered(namespace, implementation)).to.be.true

          expect(await registry.isRegistered(anotherNamespace, implementation)).to.be.false
          expect(await registry.isRegistered(namespace, anotherImplementation)).to.be.false
        })

        it('emits an event', async () => {
          const tx = await registry.register(namespace, implementation)

          await assertEvent(tx, 'Registered', { namespace, implementation })
        })
      })

      context('when the requested implementation is registered', () => {
        beforeEach('register', async () => {
          await registry.register(namespace, implementation)
        })

        it('reverts', async () => {
          await expect(registry.register(namespace, implementation)).to.be.revertedWith('IMPLEMENTATION_REGISTERED')
        })
      })
    })

    context('when the sender cannot register', () => {
      beforeEach('set sender', () => {
        registry = registry.connect(other)
      })

      it('reverts', async () => {
        await expect(registry.register(namespace, implementation)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('unregister', () => {
    context('when the sender can unregister', () => {
      beforeEach('set sender', () => {
        registry = registry.connect(admin)
      })

      context('when the requested implementation is not registered', () => {
        it('reverts', async () => {
          await expect(registry.unregister(namespace, implementation)).to.be.revertedWith(
            'IMPLEMENTATION_NOT_REGISTERED'
          )
        })
      })

      context('when the requested implementation is registered', () => {
        beforeEach('register', async () => {
          await registry.register(namespace, implementation)
        })

        context('when the implementation is still registered', () => {
          it('unregisters the requested implementation', async () => {
            await registry.unregister(namespace, implementation)

            expect(await registry.getNamespace(implementation)).to.be.equal(namespace)
            expect(await registry.isRegistered(namespace, implementation)).to.be.false

            expect(await registry.isRegistered(anotherNamespace, implementation)).to.be.false
            expect(await registry.isRegistered(namespace, anotherImplementation)).to.be.false
          })

          it('emits an event', async () => {
            const tx = await registry.unregister(namespace, implementation)

            await assertEvent(tx, 'Unregistered', { namespace, implementation })
          })

          it('can be re-registered with the same namespace', async () => {
            await registry.unregister(namespace, implementation)

            await registry.register(namespace, implementation)

            expect(await registry.getNamespace(implementation)).to.be.equal(namespace)
            expect(await registry.isRegistered(namespace, implementation)).to.be.true
          })

          it('cannot be re-registered with another namespace', async () => {
            await registry.unregister(namespace, implementation)
            await expect(registry.register(ONES_BYTES32, implementation)).to.be.revertedWith(
              'IMPLEMENTATION_NAMESPACE_USED'
            )
          })
        })

        context('when the implementation is not registered anymore', () => {
          beforeEach('unregister', async () => {
            await registry.unregister(namespace, implementation)
          })

          it('reverts', async () => {
            await expect(registry.unregister(namespace, implementation)).to.be.revertedWith(
              'IMPLEMENTATION_NOT_REGISTERED'
            )
          })
        })
      })
    })

    context('when the sender cannot unregister', () => {
      beforeEach('set sender', () => {
        registry = registry.connect(other)
      })

      it('reverts', async () => {
        await expect(registry.unregister(namespace, implementation)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('clone', () => {
    context('when the implementation was registered', () => {
      beforeEach('register', async () => {
        await registry.connect(admin).register(namespace, implementation)
      })

      context('when the implementation is still registered', () => {
        it('clones the implementation', async () => {
          const tx = await registry.clone(namespace, implementation)
          const { args } = await assertEvent(tx, 'Cloned', { namespace, implementation })
          const instance = await instanceAt('ImplementationMock', args.instance)

          expect(await instance.registry()).to.be.equal(registry.address)
          expect(await registry.isRegistered(namespace, instance.address)).to.be.false

          const authorizeRole = registry.interface.getSighash('authorize')
          expect(await instance.isAuthorized(admin.address, authorizeRole)).to.be.false

          const unauthorizeRole = registry.interface.getSighash('unauthorize')
          expect(await instance.isAuthorized(admin.address, unauthorizeRole)).to.be.false

          await instance.initialize(admin.address)
          expect(await instance.isAuthorized(admin.address, authorizeRole)).to.be.true
          expect(await instance.isAuthorized(admin.address, unauthorizeRole)).to.be.true
          await expect(instance.initialize(admin.address)).to.be.revertedWith(
            'Initializable: contract is already initialized'
          )
        })
      })

      context('when the implementation is not registered anymore', () => {
        beforeEach('unregister', async () => {
          await registry.connect(admin).unregister(namespace, implementation)
        })

        it('reverts', async () => {
          await expect(registry.clone(namespace, implementation)).to.be.revertedWith('IMPLEMENTATION_NOT_REGISTERED')
        })
      })
    })

    context('when the implementation was not registered', () => {
      it('reverts', async () => {
        await expect(registry.clone(namespace, implementation)).to.be.revertedWith('IMPLEMENTATION_NOT_REGISTERED')
      })
    })
  })
})
