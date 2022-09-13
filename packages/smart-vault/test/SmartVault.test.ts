import { assertEvent, deploy, getSigners, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import { createClone } from '@mimic-fi/v2-registry'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

describe('SmartVault', () => {
  let smartVault: Contract, wallet: Contract, registry: Contract
  let admin: SignerWithAddress, other: SignerWithAddress, action: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin, other, action] = await getSigners()
  })

  before('deploy registry', async () => {
    registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [admin.address])
  })

  before('deploy wallet instance', async () => {
    wallet = await createClone(
      registry,
      admin,
      '@mimic-fi/v2-wallet/artifacts/contracts/Wallet.sol/Wallet',
      [ZERO_ADDRESS, registry.address],
      [admin.address]
    )
  })

  describe('initialize', async () => {
    context('when the given wallet implementation was registered', () => {
      it('can be initialized', async () => {
        smartVault = await createClone(
          registry,
          admin,
          'SmartVault',
          [registry.address],
          [admin.address, wallet.address]
        )

        expect(await smartVault.wallet()).to.be.equal(wallet.address)
      })
    })

    context('when the given wallet implementation was not registered', () => {
      it('cannot be initialized', async () => {
        await expect(
          createClone(registry, admin, 'SmartVault', [registry.address], [admin.address, registry.address])
        ).to.be.revertedWith('NEW_DEPENDENCY_NOT_REGISTERED')
      })
    })
  })

  describe('setAction', () => {
    beforeEach('deploy smart vault', async () => {
      smartVault = await createClone(registry, admin, 'SmartVault', [registry.address], [admin.address, wallet.address])
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
