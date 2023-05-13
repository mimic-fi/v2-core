import { deploy, ONES_BYTES32 } from '@mimic-fi/v2-helpers'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { ethers } from 'hardhat'

describe('Create3Factory', () => {
  let factory: Contract

  const SALT = ONES_BYTES32

  beforeEach('deploy create 3 factory', async () => {
    factory = await deploy('Create3Factory')
  })

  const getRandomContractCode = (size: number): { bytecode: string; creationCode: string } => {
    const bytes = ethers.utils.randomBytes(size)
    if (bytes[0] === 239) bytes[0] = 240 // 0xef forbidden by EIP-3541
    const bytecode = ethers.utils.hexlify(bytes)
    const creationCode = `0x63${size.toString(16).padStart(8, '0')}80600E6000396000F3${bytecode.slice(2)}`
    return { creationCode, bytecode }
  }

  context('when the bytecode is valid', async () => {
    context('when the salt was not used', async () => {
      it('creates contract', async () => {
        const { bytecode, creationCode } = getRandomContractCode(911)

        await factory.create(SALT, creationCode)

        const address = await factory.addressOf(SALT)
        expect(await ethers.provider.getCode(address)).to.equal(bytecode)
      })

      it('forwards payable amount to child contract', async () => {
        const { creationCode } = getRandomContractCode(911)

        await factory.create(SALT, creationCode, { value: 10 })

        const address = await factory.addressOf(SALT)
        expect(await ethers.provider.getBalance(address)).to.equal(10)
      })

      it('can reuse the same salt from a different factory', async () => {
        const anotherFactory = await deploy('Create3Factory')
        const { creationCode, bytecode } = getRandomContractCode(911)

        const address = await factory.addressOf(SALT)
        const anotherAddress = await anotherFactory.addressOf(SALT)
        expect(address).to.not.be.equal(anotherAddress)

        await factory.create(SALT, creationCode)
        expect(await ethers.provider.getCode(address)).to.equal(bytecode)

        await anotherFactory.create(SALT, creationCode)
        expect(await ethers.provider.getCode(anotherAddress)).to.equal(bytecode)
      })
    })

    context('when the salt was already used', async () => {
      beforeEach('create contract', async () => {
        const { creationCode } = getRandomContractCode(911)
        await factory.create(SALT, creationCode)
      })

      it('reverts', async () => {
        const { creationCode } = getRandomContractCode(911)

        await expect(factory.create(SALT, creationCode)).to.be.revertedWith('CREATE3_TARGET_ALREADY_EXISTS')
      })
    })
  })

  context('when the bytecode is not valid', () => {
    context('when the bytecode is empty', () => {
      const bytecode = '0x'

      it('reverts', async () => {
        await expect(factory.create(SALT, bytecode)).to.be.revertedWith('CREATE3_ERROR_CREATING_CONTRACT')
      })
    })

    context('when it starts with 0xef (EIP 3541)', () => {
      // EIP-3541 forbids the creation of contracts starting with 0xef
      const bytecode = '0xef'

      it('reverts', async () => {
        await expect(factory.create(SALT, bytecode)).to.be.revertedWith('CREATE3_ERROR_CREATING_CONTRACT')
      })
    })

    context('when the bytecode is above the limit (EIP 170)', () => {
      it('reverts', async () => {
        const { creationCode } = getRandomContractCode(24577)

        await expect(factory.create(SALT, creationCode, { gasLimit: 28000000 })).to.be.revertedWith(
          'CREATE3_ERROR_CREATING_CONTRACT'
        )
      })
    })
  })
})
