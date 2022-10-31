import {
  assertEvent,
  deploy,
  getSigners,
  instanceAt,
  itBehavesLikeAuthorizer,
  ZERO_ADDRESS,
} from '@mimic-fi/v2-helpers'
import { createClone } from '@mimic-fi/v2-registry'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { ethers } from 'hardhat'

describe('SmartVault', () => {
  let smartVault: Contract, registry: Contract
  let admin: SignerWithAddress, other: SignerWithAddress, action: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin, other, action] = await getSigners()
  })

  before('deploy registry', async () => {
    registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [admin.address])
  })

  describe('initialization', async () => {
    beforeEach('deploy smart vault', async () => {
      smartVault = await createClone(registry, admin, 'SmartVault', [registry.address], [admin.address])
    })

    it('has a registry reference', async () => {
      expect(await smartVault.registry()).to.be.equal(registry.address)
    })

    it('cannot be initialized twice', async () => {
      await expect(smartVault.initialize(admin.address)).to.be.revertedWith(
        'Initializable: contract is already initialized'
      )
    })

    it('its implementation is already initialized', async () => {
      const implementation = await instanceAt('SmartVault', await registry.implementationOf(smartVault.address))
      await expect(implementation.initialize(admin.address)).to.be.revertedWith(
        'Initializable: contract is already initialized'
      )
    })

    it('is properly registered in the registry', async () => {
      const implementation = await registry.implementationOf(smartVault.address)
      const implementationData = await registry.implementationData(implementation)

      expect(implementationData.deprecated).to.be.false
      expect(implementationData.namespace).to.be.equal(await smartVault.NAMESPACE())
    })

    it('has the expected namespace', async () => {
      expect(await smartVault.NAMESPACE()).to.be.equal(ethers.utils.solidityKeccak256(['string'], ['SMART_VAULT']))
    })
  })

  describe('authorizer', () => {
    beforeEach('setup authorizer tests', async function () {
      this.admin = admin
      this.authorizer = smartVault
    })

    itBehavesLikeAuthorizer()
  })

  describe('setWallet', () => {
    let newWallet: Contract

    beforeEach('deploy smart vault', async () => {
      smartVault = await createClone(registry, admin, 'SmartVault', [registry.address], [admin.address])
    })

    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setWalletRole = smartVault.interface.getSighash('setWallet')
        await smartVault.connect(admin).authorize(admin.address, setWalletRole)
        smartVault = smartVault.connect(admin)
      })

      context('when the wallet was already set', async () => {
        beforeEach('deploy wallet', async () => {
          newWallet = await createClone(
            registry,
            admin,
            '@mimic-fi/v2-wallet/artifacts/contracts/Wallet.sol/Wallet',
            [ZERO_ADDRESS, registry.address],
            [admin.address]
          )

          await smartVault.setWallet(newWallet.address)
        })

        it('reverts', async () => {
          await expect(smartVault.setWallet(ZERO_ADDRESS)).to.be.revertedWith('WALLET_ALREADY_SET')
        })
      })

      context('when the wallet was not set', async () => {
        context('when the wallet is registered', async () => {
          it('sets the implementation', async () => {
            await smartVault.setWallet(newWallet.address)

            expect(await smartVault.wallet()).to.be.equal(newWallet.address)
          })

          it('emits an event', async () => {
            const tx = await smartVault.setWallet(newWallet.address)
            await assertEvent(tx, 'WalletSet', { wallet: newWallet })
          })
        })

        context('when the wallet is not registered', async () => {
          beforeEach('deploy wallet', async () => {
            newWallet = await deploy('@mimic-fi/v2-wallet/artifacts/contracts/Wallet.sol/Wallet', [
              ZERO_ADDRESS,
              registry.address,
            ])
          })

          it('reverts', async () => {
            await expect(smartVault.setWallet(newWallet.address)).to.be.revertedWith('DEPENDENCY_NOT_REGISTERED')
          })
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.setWallet(ZERO_ADDRESS)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setAction', () => {
    beforeEach('deploy smart vault', async () => {
      smartVault = await createClone(registry, admin, 'SmartVault', [registry.address], [admin.address])
    })

    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setActionRole = smartVault.interface.getSighash('setAction')
        await smartVault.connect(admin).authorize(admin.address, setActionRole)
        smartVault = smartVault.connect(admin)
      })

      context('when the action was not whitelisted', async () => {
        it('can be whitelisted', async () => {
          const tx = await smartVault.setAction(action.address, true)

          expect(await smartVault.isActionWhitelisted(action.address)).to.be.true
          await assertEvent(tx, 'ActionSet', { action, whitelisted: true })
        })

        it('can be blacklisted', async () => {
          const tx = await smartVault.setAction(action.address, false)

          expect(await smartVault.isActionWhitelisted(action.address)).to.be.false
          await assertEvent(tx, 'ActionSet', { action, whitelisted: false })
        })
      })

      context('when the action was whitelisted', async () => {
        beforeEach('whitelist action', async () => {
          await smartVault.setAction(action.address, true)
        })

        it('can be whitelisted', async () => {
          const tx = await smartVault.setAction(action.address, true)

          expect(await smartVault.isActionWhitelisted(action.address)).to.be.true
          await assertEvent(tx, 'ActionSet', { action, whitelisted: true })
        })

        it('can be blacklisted', async () => {
          const tx = await smartVault.setAction(action.address, false)

          expect(await smartVault.isActionWhitelisted(action.address)).to.be.false
          await assertEvent(tx, 'ActionSet', { action, whitelisted: false })
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.setAction(ZERO_ADDRESS, true)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })
})
