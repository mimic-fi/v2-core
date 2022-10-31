import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'

import { deploy, getSigner, itBehavesLikeAuthorizer } from '../../../'
import { ONES_ADDRESS } from '../../../src/constants'

describe('Authorizer', () => {
  beforeEach('setup authorizer', async function () {
    this.admin = await getSigner(1)
    this.authorizer = await deploy('AuthorizerMock', [this.admin.address])
  })

  itBehavesLikeAuthorizer()

  describe('authenticate', function () {
    let other: SignerWithAddress

    beforeEach('load other address', async function () {
      other = await getSigner(0)
    })

    const ROLE = '0xaabbccdd'
    const ANY = ONES_ADDRESS

    context('when the target address is authorized', function () {
      beforeEach('authorize', async function () {
        await this.authorizer.connect(this.admin).authorize(other.address, ROLE)
      })

      context('when the any address is authorized', function () {
        beforeEach('authorize', async function () {
          await this.authorizer.connect(this.admin).authorize(ANY, ROLE)
        })

        it('does not revert', async function () {
          await expect(this.authorizer.authenticate(other.address, ROLE)).not.to.be.reverted
        })
      })

      context('when the any address is not authorized', function () {
        beforeEach('unauthorize', async function () {
          await this.authorizer.connect(this.admin).unauthorize(ANY, ROLE)
        })

        it('does not revert', async function () {
          await expect(this.authorizer.authenticate(other.address, ROLE)).not.to.be.reverted
        })
      })
    })

    context('when the target address is not authorized', function () {
      beforeEach('unauthorize', async function () {
        await this.authorizer.connect(this.admin).unauthorize(other.address, ROLE)
      })

      context('when the any address is authorized', function () {
        beforeEach('authorize', async function () {
          await this.authorizer.connect(this.admin).authorize(ANY, ROLE)
        })

        it('does not revert', async function () {
          await expect(this.authorizer.authenticate(other.address, ROLE)).not.to.be.reverted
        })
      })

      context('when the any address is not authorized', function () {
        beforeEach('unauthorize', async function () {
          await this.authorizer.connect(this.admin).unauthorize(ANY, ROLE)
        })

        it('reverts', async function () {
          await expect(this.authorizer.authenticate(other.address, ROLE)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
        })
      })
    })
  })
})
