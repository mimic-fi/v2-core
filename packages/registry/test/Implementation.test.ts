import { deploy, getSigners } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

describe('Implementation', () => {
  let implementation: Contract, registry: Contract, admin: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin] = await getSigners()
  })

  beforeEach('deploy implementation', async () => {
    registry = await deploy('Registry', [admin.address])
    implementation = await deploy('ImplementationMock', [registry.address])
  })

  it('has a registry reference', async () => {
    expect(await implementation.registry()).to.be.equal(registry.address)
  })

  it('can be initialized only once', async () => {
    await implementation.initialize(admin.address)

    const authorizeRole = implementation.interface.getSighash('authorize')
    expect(await implementation.isAuthorized(admin.address, authorizeRole)).to.be.true

    const unauthorizeRole = implementation.interface.getSighash('unauthorize')
    expect(await implementation.isAuthorized(admin.address, unauthorizeRole)).to.be.true

    await expect(implementation.initialize(admin.address)).to.be.revertedWith(
      'Initializable: contract is already initialized'
    )
  })
})
