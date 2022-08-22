import {
  assertEvent,
  deploy,
  getSigners,
  ONES_ADDRESS,
  ONES_BYTES32,
  ZERO_ADDRESS,
  ZERO_BYTES32,
} from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

describe('Registry', () => {
  let registry: Contract
  let admin: SignerWithAddress, other: SignerWithAddress

  const namespace = ZERO_BYTES32
  const anotherNamespace = ONES_BYTES32
  const implementation = ZERO_ADDRESS
  const anotherImplementation = ONES_ADDRESS

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin, other] = await getSigners()
  })

  beforeEach('create registry', async () => {
    registry = await deploy('Registry', [admin.address])
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
  })

  describe('register', () => {
    const itRegisters = () => {
      it('registers the requested implementation', async () => {
        await registry.register(namespace, implementation)

        expect(await registry.isRegistered(namespace, implementation)).to.be.true

        expect(await registry.isRegistered(anotherNamespace, implementation)).to.be.false
        expect(await registry.isRegistered(namespace, anotherImplementation)).to.be.false
      })

      it('emits an event', async () => {
        const tx = await registry.register(namespace, implementation)

        await assertEvent(tx, 'Registered', { namespace, implementation })
      })
    }

    context('when the sender can register', () => {
      beforeEach('set sender', () => {
        registry = registry.connect(admin)
      })

      context('when the requested implementation is not registered', () => {
        beforeEach('unregister', async () => {
          await registry.unregister(namespace, implementation)
        })

        itRegisters()
      })

      context('when the requested implementation is registered', () => {
        beforeEach('register', async () => {
          await registry.register(namespace, implementation)
        })

        itRegisters()
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
    const itUnregisters = () => {
      it('unregisters the requested implementation', async () => {
        await registry.unregister(namespace, implementation)

        expect(await registry.isRegistered(namespace, implementation)).to.be.false

        expect(await registry.isRegistered(anotherNamespace, implementation)).to.be.false
        expect(await registry.isRegistered(namespace, anotherImplementation)).to.be.false
      })

      it('emits an event', async () => {
        const tx = await registry.unregister(namespace, implementation)

        await assertEvent(tx, 'Unregistered', { namespace, implementation })
      })
    }

    context('when the sender can unregister', () => {
      beforeEach('set sender', () => {
        registry = registry.connect(admin)
      })

      context('when the requested implementation is not registered', () => {
        beforeEach('unregister', async () => {
          await registry.unregister(namespace, implementation)
        })

        itUnregisters()
      })

      context('when the requested implementation is registered', () => {
        beforeEach('register', async () => {
          await registry.register(namespace, implementation)
        })

        itUnregisters()
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
})
