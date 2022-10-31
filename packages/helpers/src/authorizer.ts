import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'

import { assertEvent } from './asserts'
import { ONES_ADDRESS } from './constants'
import { getSigner } from './signers'

export function itBehavesLikeAuthorizer(): void {
  let other: SignerWithAddress

  beforeEach('load other address', async function () {
    other = await getSigner(0)
  })

  const ROLE = '0xaabbccdd'
  const ANY = ONES_ADDRESS

  describe('initialization', function () {
    it('authorizes the admin to authorize', async function () {
      const authorizeRole = this.authorizer.interface.getSighash('authorize')

      expect(await this.authorizer.isAuthorized(this.admin.address, authorizeRole)).to.be.true
      expect(await this.authorizer.isAuthorized(other.address, authorizeRole)).to.be.false
      expect(await this.authorizer.isAuthorized(ANY, authorizeRole)).to.be.false
    })

    it('authorizes the admin to unauthorize', async function () {
      const unauthorizeRole = this.authorizer.interface.getSighash('unauthorize')

      expect(await this.authorizer.isAuthorized(this.admin.address, unauthorizeRole)).to.be.true
      expect(await this.authorizer.isAuthorized(other.address, unauthorizeRole)).to.be.false
      expect(await this.authorizer.isAuthorized(ANY, unauthorizeRole)).to.be.false
    })

    it('does not have any signature collisions', async function () {
      const functionsBySig = Object.keys(this.authorizer.interface.functions).reduce(
        (map: { [key: string]: string[] }, name: string) => {
          const sig = this.authorizer.interface.getSighash(name)
          map[sig] = !map[sig] ? [name] : [...map[sig], name]
          return map
        },
        {}
      )

      Object.keys(functionsBySig).forEach((sig: string) => {
        expect(functionsBySig[sig]).to.have.lengthOf(1, `${functionsBySig[sig].join(', ')} have same signatures`)
      })
    })
  })

  describe('authorize', function () {
    let who: string

    const itAuthorizes = function () {
      it('authorizes the target address', async function () {
        await this.authorizer.authorize(who, ROLE)

        expect(await this.authorizer.isAuthorized(who, ROLE)).to.be.true
      })

      it('emits an event', async function () {
        const tx = await this.authorizer.authorize(who, ROLE)

        await assertEvent(tx, 'Authorized', { who, what: ROLE })
      })
    }

    context('when the sender can unauthorize', function () {
      beforeEach('set sender', function () {
        this.authorizer = this.authorizer.connect(this.admin)
      })

      context('when the target address is any', function () {
        beforeEach('set target', function () {
          who = ONES_ADDRESS
        })

        context('when the target address is authorized', function () {
          beforeEach('authorize', async function () {
            await this.authorizer.authorize(ANY, ROLE)
          })

          itAuthorizes()
        })

        context('when the target address is not authorized', function () {
          beforeEach('unauthorize', async function () {
            await this.authorizer.unauthorize(ANY, ROLE)
          })

          itAuthorizes()
        })
      })

      context('when the target address is another address', function () {
        beforeEach('set target', function () {
          who = other.address
        })

        context('when the target address is authorized', function () {
          beforeEach('authorize', async function () {
            await this.authorizer.authorize(who, ROLE)
          })

          itAuthorizes()
        })

        context('when the target address is not authorized', function () {
          beforeEach('unauthorize', async function () {
            await this.authorizer.unauthorize(who, ROLE)
          })

          itAuthorizes()
        })
      })
    })

    context('when the sender cannot authorize', function () {
      beforeEach('set sender', function () {
        this.authorizer = this.authorizer.connect(other)
      })

      it('reverts', async function () {
        await expect(this.authorizer.authorize(who, ROLE)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('unauthorize', function () {
    let who: string

    const itUnauthorizes = function () {
      it('unauthorizes the target address', async function () {
        await this.authorizer.unauthorize(who, ROLE)

        expect(await this.authorizer.isAuthorized(who, ROLE)).to.be.false
      })

      it('emits an event', async function () {
        const tx = await this.authorizer.unauthorize(who, ROLE)

        await assertEvent(tx, 'Unauthorized', { who, what: ROLE })
      })
    }

    context('when the sender can unauthorize', function () {
      beforeEach('set sender', function () {
        this.authorizer = this.authorizer.connect(this.admin)
      })

      context('when the target address is any', function () {
        beforeEach('set target', function () {
          who = ONES_ADDRESS
        })

        context('when the target address is authorized', function () {
          beforeEach('authorize', async function () {
            await this.authorizer.authorize(ANY, ROLE)
          })

          itUnauthorizes()
        })

        context('when the target address is not authorized', function () {
          beforeEach('unauthorize', async function () {
            await this.authorizer.unauthorize(ANY, ROLE)
          })

          itUnauthorizes()
        })
      })

      context('when the target address is another address', function () {
        beforeEach('set target', function () {
          who = other.address
        })

        context('when the target address is authorized', function () {
          beforeEach('authorize', async function () {
            await this.authorizer.authorize(who, ROLE)
          })

          itUnauthorizes()
        })

        context('when the target address is not authorized', function () {
          beforeEach('unauthorize', async function () {
            await this.authorizer.unauthorize(who, ROLE)
          })

          itUnauthorizes()
        })
      })
    })

    context('when the sender cannot unauthorize', function () {
      beforeEach('set sender', function () {
        this.authorizer = this.authorizer.connect(other)
      })

      it('reverts', async function () {
        await expect(this.authorizer.authorize(ANY, ROLE)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })
}
