import { assertEvent, deploy, getSigner, instanceAt, ONES_BYTES32 } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { ethers } from 'hardhat'

describe('SmartVaultsFactory', () => {
  let factory: Contract, registry: Contract
  let admin: SignerWithAddress

  beforeEach('deploy factory', async () => {
    admin = await getSigner()
    registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [admin.address])
    factory = await deploy('SmartVaultsFactory', [registry.address])
  })

  describe('initialization', async () => {
    it('has a registry reference', async () => {
      expect(await factory.registry()).to.be.equal(registry.address)
    })

    it('has the expected namespace', async () => {
      const expectedNamespace = ethers.utils.solidityKeccak256(['string'], ['SMART_VAULTS_FACTORY'])
      expect(await factory.NAMESPACE()).to.be.equal(expectedNamespace)
    })
  })

  describe('create', () => {
    let implementation: Contract
    let initializeData: string

    const SALT = ethers.utils.hexlify(ethers.utils.randomBytes(32))

    beforeEach('deploy implementation', async () => {
      const wrappedNativeToken = await deploy('WrappedNativeTokenMock')
      implementation = await deploy('SmartVault', [wrappedNativeToken.address, registry.address])
      initializeData = implementation.interface.encodeFunctionData('initialize', [admin.address])
    })

    context('when the implementation is registered', () => {
      context('when the implementation is registered with the smart vaults namespace', () => {
        const namespace = ethers.utils.solidityKeccak256(['string'], ['SMART_VAULT'])

        function itCreatesNewInstance() {
          let instance: Contract

          beforeEach('create', async () => {
            const tx = await factory.create(SALT, implementation.address, initializeData)
            const { args } = await assertEvent(tx, 'Created', { implementation })
            instance = await instanceAt('SmartVault', args.instance)
          })

          it('creates a new instance', async () => {
            expect(await instance.registry()).to.be.equal(registry.address)
            expect(await instance.NAMESPACE()).to.be.equal(namespace)
            expect(await factory.implementationOf(instance.address)).to.be.equal(implementation.address)
          })

          it('initializes the new instance', async () => {
            await expect(instance.initialize(admin.address)).to.be.revertedWith(
              'Initializable: contract is already initialized'
            )
          })

          it('depends on the sender address', async () => {
            await expect(factory.create(SALT, implementation.address, initializeData)).to.be.revertedWith(
              'ERC1167: create2 failed'
            )

            const anotherSender = await getSigner(3)
            const tx = await factory.connect(anotherSender).create(SALT, implementation.address, initializeData)
            const { args } = await assertEvent(tx, 'Created', { implementation })
            expect(args.instance).to.not.be.equal(instance.address)
          })
        }

        const itReverts = () => {
          it('reverts', async () => {
            await expect(factory.create(SALT, implementation.address, initializeData)).to.be.revertedWith(
              'BAD_SMART_VAULT_IMPLEMENTATION'
            )
          })
        }

        context('when the implementation is stateless', () => {
          const stateless = true

          beforeEach('register', async () => {
            await registry.connect(admin).register(namespace, implementation.address, stateless)
          })

          context('when the implementation is not deprecated', () => {
            itCreatesNewInstance()
          })

          context('when the implementation is deprecated', () => {
            beforeEach('deprecate', async () => {
              await registry.connect(admin).deprecate(implementation.address)
            })

            itReverts()
          })
        })

        context('when the implementation is stateful', () => {
          const stateless = false

          beforeEach('register', async () => {
            await registry.connect(admin).register(namespace, implementation.address, stateless)
          })

          context('when the implementation is not deprecated', () => {
            itCreatesNewInstance()
          })

          context('when the implementation is deprecated', () => {
            beforeEach('deprecate', async () => {
              await registry.connect(admin).deprecate(implementation.address)
            })

            itReverts()
          })
        })
      })

      context('when the implementation is registered with another namespace', () => {
        const namespace = ONES_BYTES32

        const itReverts = () => {
          it('reverts', async () => {
            await expect(factory.create(SALT, implementation.address, initializeData)).to.be.revertedWith(
              'BAD_SMART_VAULT_IMPLEMENTATION'
            )
          })
        }

        context('when the implementation is stateless', () => {
          const stateless = true

          beforeEach('register', async () => {
            await registry.connect(admin).register(namespace, implementation.address, stateless)
          })

          context('when the implementation is not deprecated', () => {
            itReverts()
          })

          context('when the implementation is deprecated', () => {
            beforeEach('deprecate', async () => {
              await registry.connect(admin).deprecate(implementation.address)
            })

            itReverts()
          })
        })

        context('when the implementation is stateful', () => {
          const stateless = false

          beforeEach('register', async () => {
            await registry.connect(admin).register(namespace, implementation.address, stateless)
          })

          context('when the implementation is not deprecated', () => {
            itReverts()
          })

          context('when the implementation is deprecated', () => {
            beforeEach('deprecate', async () => {
              await registry.connect(admin).deprecate(implementation.address)
            })

            itReverts()
          })
        })
      })
    })

    context('when the implementation is not registered', () => {
      it('reverts', async () => {
        await expect(factory.create(SALT, implementation.address, initializeData)).to.be.revertedWith(
          'BAD_SMART_VAULT_IMPLEMENTATION'
        )
      })
    })
  })
})
