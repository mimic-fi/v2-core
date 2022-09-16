import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { Contract } from 'ethers'

import { deploy, getSigners } from '../../../'
import { assertEvent } from '../../../src/asserts'
import { ONES_ADDRESS } from '../../../src/constants'

describe('Authorizer', () => {
  let authorizer: Contract
  let admin: SignerWithAddress, other: SignerWithAddress

  const ROLE = '0xaabbccdd'
  const ANY = ONES_ADDRESS

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin, other] = await getSigners()
  })

  beforeEach('create authorizer', async () => {
    authorizer = await deploy('AuthorizerMock', [admin.address])
  })

  describe('initialization', () => {
    it('authorizes the admin to authorize', async () => {
      const authorizeRole = authorizer.interface.getSighash('authorize')

      expect(await authorizer.isAuthorized(admin.address, authorizeRole)).to.be.true
      expect(await authorizer.isAuthorized(other.address, authorizeRole)).to.be.false
      expect(await authorizer.isAuthorized(ANY, authorizeRole)).to.be.false
    })

    it('authorizes the admin to unauthorize', async () => {
      const unauthorizeRole = authorizer.interface.getSighash('unauthorize')

      expect(await authorizer.isAuthorized(admin.address, unauthorizeRole)).to.be.true
      expect(await authorizer.isAuthorized(other.address, unauthorizeRole)).to.be.false
      expect(await authorizer.isAuthorized(ANY, unauthorizeRole)).to.be.false
    })
  })

  describe('authorize', () => {
    let who: string

    const itAuthorizes = () => {
      it('authorizes the target address', async () => {
        await authorizer.authorize(who, ROLE)

        expect(await authorizer.isAuthorized(who, ROLE)).to.be.true
      })

      it('emits an event', async () => {
        const tx = await authorizer.authorize(who, ROLE)

        await assertEvent(tx, 'Authorized', { who, what: ROLE })
      })
    }

    context('when the sender can unauthorize', () => {
      beforeEach('set sender', () => {
        authorizer = authorizer.connect(admin)
      })

      context('when the target address is any', () => {
        beforeEach('set target', () => {
          who = ONES_ADDRESS
        })

        context('when the target address is authorized', () => {
          beforeEach('authorize', async () => {
            await authorizer.authorize(ANY, ROLE)
          })

          itAuthorizes()
        })

        context('when the target address is not authorized', () => {
          beforeEach('unauthorize', async () => {
            await authorizer.unauthorize(ANY, ROLE)
          })

          itAuthorizes()
        })
      })

      context('when the target address is another address', () => {
        beforeEach('set target', () => {
          who = other.address
        })

        context('when the target address is authorized', () => {
          beforeEach('authorize', async () => {
            await authorizer.authorize(who, ROLE)
          })

          itAuthorizes()
        })

        context('when the target address is not authorized', () => {
          beforeEach('unauthorize', async () => {
            await authorizer.unauthorize(who, ROLE)
          })

          itAuthorizes()
        })
      })
    })

    context('when the sender cannot authorize', () => {
      beforeEach('set sender', () => {
        authorizer = authorizer.connect(other)
      })

      it('reverts', async () => {
        await expect(authorizer.authorize(who, ROLE)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('unauthorize', () => {
    let who: string

    const itUnauthorizes = () => {
      it('unauthorizes the target address', async () => {
        await authorizer.unauthorize(who, ROLE)

        expect(await authorizer.isAuthorized(who, ROLE)).to.be.false
      })

      it('emits an event', async () => {
        const tx = await authorizer.unauthorize(who, ROLE)

        await assertEvent(tx, 'Unauthorized', { who, what: ROLE })
      })
    }

    context('when the sender can unauthorize', () => {
      beforeEach('set sender', () => {
        authorizer = authorizer.connect(admin)
      })

      context('when the target address is any', () => {
        beforeEach('set target', () => {
          who = ONES_ADDRESS
        })

        context('when the target address is authorized', () => {
          beforeEach('authorize', async () => {
            await authorizer.authorize(ANY, ROLE)
          })

          itUnauthorizes()
        })

        context('when the target address is not authorized', () => {
          beforeEach('unauthorize', async () => {
            await authorizer.unauthorize(ANY, ROLE)
          })

          itUnauthorizes()
        })
      })

      context('when the target address is another address', () => {
        beforeEach('set target', () => {
          who = other.address
        })

        context('when the target address is authorized', () => {
          beforeEach('authorize', async () => {
            await authorizer.authorize(who, ROLE)
          })

          itUnauthorizes()
        })

        context('when the target address is not authorized', () => {
          beforeEach('unauthorize', async () => {
            await authorizer.unauthorize(who, ROLE)
          })

          itUnauthorizes()
        })
      })
    })

    context('when the sender cannot unauthorize', () => {
      beforeEach('set sender', () => {
        authorizer = authorizer.connect(other)
      })

      it('reverts', async () => {
        await expect(authorizer.authorize(ANY, ROLE)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('authenticate', () => {
    context('when the target address is authorized', () => {
      beforeEach('authorize', async () => {
        await authorizer.connect(admin).authorize(other.address, ROLE)
      })

      context('when the any address is authorized', () => {
        beforeEach('authorize', async () => {
          await authorizer.connect(admin).authorize(ANY, ROLE)
        })

        it('does not revert', async () => {
          await expect(authorizer.authenticate(other.address, ROLE)).not.to.be.reverted
        })
      })

      context('when the any address is not authorized', () => {
        beforeEach('unauthorize', async () => {
          await authorizer.connect(admin).unauthorize(ANY, ROLE)
        })

        it('does not revert', async () => {
          await expect(authorizer.authenticate(other.address, ROLE)).not.to.be.reverted
        })
      })
    })

    context('when the target address is not authorized', () => {
      beforeEach('unauthorize', async () => {
        await authorizer.connect(admin).unauthorize(other.address, ROLE)
      })

      context('when the any address is authorized', () => {
        beforeEach('authorize', async () => {
          await authorizer.connect(admin).authorize(ANY, ROLE)
        })

        it('does not revert', async () => {
          await expect(authorizer.authenticate(other.address, ROLE)).not.to.be.reverted
        })
      })

      context('when the any address is not authorized', () => {
        beforeEach('unauthorize', async () => {
          await authorizer.connect(admin).unauthorize(ANY, ROLE)
        })

        it('reverts', async () => {
          await expect(authorizer.authenticate(other.address, ROLE)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
        })
      })
    })
  })
})
