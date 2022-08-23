import { assertEvent, bn, deploy, getSigners, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

describe('PriceOracle', () => {
  let admin: SignerWithAddress, other: SignerWithAddress
  let oracle: Contract, registry: Contract, base: Contract, quote: Contract, feed: Contract

  const PIVOT = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' // ETH

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin, other] = await getSigners()
  })

  beforeEach('create oracle', async () => {
    registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/Registry.sol/Registry', [admin.address])
    oracle = await deploy('PriceOracle', [PIVOT, admin.address, registry.address])
  })

  describe('setFeeds', () => {
    beforeEach('deploy feed and tokens', async () => {
      feed = await deploy('FeedMock', [0, 0])
      base = await deploy('TokenMock', ['BASE', 18])
      quote = await deploy('TokenMock', ['QUOTE', 18])
    })

    context('when the sender is authorized', () => {
      beforeEach('authorize', async () => {
        const setFeedsRole = oracle.interface.getSighash('setFeeds')
        await oracle.connect(admin).authorize(other.address, setFeedsRole)
        oracle = oracle.connect(other)
      })

      context('when the input length is valid', () => {
        const itCanBeUpdated = () => {
          context('when the feed is set', () => {
            beforeEach('set feed', async () => {
              await oracle.setFeeds([base.address], [quote.address], [feed.address])
              expect(await oracle.getFeed(base.address, quote.address)).to.be.equal(feed.address)
            })

            it('can be set', async () => {
              const tx = await oracle.setFeeds([base.address], [quote.address], [feed.address])

              expect(await oracle.hasFeed(base.address, quote.address)).to.be.true
              expect(await oracle.getFeed(base.address, quote.address)).to.be.equal(feed.address)

              await assertEvent(tx, 'FeedSet', { base, quote, feed })
            })

            it('can be unset', async () => {
              const tx = await oracle.setFeeds([base.address], [quote.address], [ZERO_ADDRESS])

              expect(await oracle.hasFeed(base.address, quote.address)).to.be.false
              expect(await oracle.getFeed(base.address, quote.address)).to.be.equal(ZERO_ADDRESS)

              await assertEvent(tx, 'FeedSet', { base, quote, feed: ZERO_ADDRESS })
            })
          })

          context('when the feed is not set', () => {
            beforeEach('unset feed', async () => {
              await oracle.setFeeds([base.address], [quote.address], [ZERO_ADDRESS])
              expect(await oracle.getFeed(base.address, quote.address)).to.be.equal(ZERO_ADDRESS)
            })

            it('can be set', async () => {
              const tx = await oracle.setFeeds([base.address], [quote.address], [feed.address])

              expect(await oracle.hasFeed(base.address, quote.address)).to.be.true
              expect(await oracle.getFeed(base.address, quote.address)).to.be.equal(feed.address)

              await assertEvent(tx, 'FeedSet', { base, quote, feed })
            })

            it('can be unset', async () => {
              const tx = await oracle.setFeeds([base.address], [quote.address], [ZERO_ADDRESS])

              expect(await oracle.hasFeed(base.address, quote.address)).to.be.false
              expect(await oracle.getFeed(base.address, quote.address)).to.be.equal(ZERO_ADDRESS)

              await assertEvent(tx, 'FeedSet', { base, quote, feed: ZERO_ADDRESS })
            })
          })
        }

        context('when the feed is in the registry', () => {
          beforeEach('register feed in registry', async () => {
            await registry.connect(admin).register(await oracle.FEEDS_NAMESPACE(), feed.address)
          })

          itCanBeUpdated()
        })

        context('when the feed is not in the registry', () => {
          beforeEach('register feed in registry', async () => {
            await registry.connect(admin).unregister(await oracle.FEEDS_NAMESPACE(), feed.address)
          })

          itCanBeUpdated()
        })
      })

      context('when the input is invalid', () => {
        it('reverts', async () => {
          await expect(
            oracle.setFeeds([base.address], [quote.address, ZERO_ADDRESS], [ZERO_ADDRESS])
          ).to.be.revertedWith('SET_FEEDS_INVALID_QUOTES_LENGTH')
          await expect(
            oracle.setFeeds([base.address], [quote.address], [ZERO_ADDRESS, ZERO_ADDRESS])
          ).to.be.revertedWith('SET_FEEDS_INVALID_FEEDS_LENGTH')
        })
      })
    })

    context('when the sender is not authorized', () => {
      it('reverts', async () => {
        await expect(oracle.setFeeds([base.address], [quote.address], [ZERO_ADDRESS])).to.be.revertedWith(
          'AUTH_SENDER_NOT_ALLOWED'
        )
      })
    })
  })

  describe('setRegisteredFeeds', () => {
    beforeEach('deploy feed and tokens', async () => {
      feed = await deploy('FeedMock', [0, 0])
      base = await deploy('TokenMock', ['BASE', 18])
      quote = await deploy('TokenMock', ['QUOTE', 18])
    })

    context('when the sender is authorized', () => {
      beforeEach('authorize', async () => {
        const setRegisteredFeedsRole = oracle.interface.getSighash('setRegisteredFeeds')
        await oracle.connect(admin).authorize(other.address, setRegisteredFeedsRole)
        oracle = oracle.connect(other)
      })

      context('when the input length is valid', () => {
        context('when the feed is in the registry', () => {
          beforeEach('register feed in registry', async () => {
            await registry.connect(admin).register(await oracle.FEEDS_NAMESPACE(), feed.address)
          })

          const itCanBeSet = () => {
            it('can be set', async () => {
              const tx = await oracle.setRegisteredFeeds([base.address], [quote.address], [feed.address])

              expect(await oracle.hasFeed(base.address, quote.address)).to.be.true
              expect(await oracle.getFeed(base.address, quote.address)).to.be.equal(feed.address)

              await assertEvent(tx, 'FeedSet', {base, quote, feed})
            })
          }

          const itCannotBeUnset = () => {
            it('cannot be unset', async () => {
              await expect(
                oracle.setRegisteredFeeds([base.address], [quote.address], [ZERO_ADDRESS])
              ).to.be.revertedWith('FEED_NOT_REGISTERED')
            })
          }

          context('when the feed is set', () => {
            beforeEach('set feed', async () => {
              await oracle.connect(admin).setFeeds([base.address], [quote.address], [feed.address])
              expect(await oracle.getFeed(base.address, quote.address)).to.be.equal(feed.address)
            })

            itCanBeSet()
            itCannotBeUnset()
          })

          context('when the feed is not set', () => {
            beforeEach('unset feed', async () => {
              await oracle.connect(admin).setFeeds([base.address], [quote.address], [ZERO_ADDRESS])
              expect(await oracle.getFeed(base.address, quote.address)).to.be.equal(ZERO_ADDRESS)
            })

            itCanBeSet()
            itCannotBeUnset()
          })
        })

        context('when the feed is not in the registry', () => {
          beforeEach('unregister feed in registry', async () => {
            await registry.connect(admin).unregister(await oracle.FEEDS_NAMESPACE(), feed.address)
          })

          context('when the feed is set', () => {
            beforeEach('set feed', async () => {
              await oracle.connect(admin).setFeeds([base.address], [quote.address], [feed.address])
              expect(await oracle.getFeed(base.address, quote.address)).to.be.equal(feed.address)
            })

            it('reverts', async () => {
              await expect(
                oracle.setRegisteredFeeds([base.address], [quote.address], [feed.address])
              ).to.be.revertedWith('FEED_NOT_REGISTERED')
            })
          })

          context('when the feed is not set', () => {
            beforeEach('unset feed', async () => {
              await oracle.connect(admin).setFeeds([base.address], [quote.address], [ZERO_ADDRESS])
              expect(await oracle.getFeed(base.address, quote.address)).to.be.equal(ZERO_ADDRESS)
            })

            it('reverts', async () => {
              await expect(
                oracle.setRegisteredFeeds([base.address], [quote.address], [feed.address])
              ).to.be.revertedWith('FEED_NOT_REGISTERED')
            })
          })
        })
      })

      context('when the input is invalid', () => {
        it('reverts', async () => {
          await expect(
            oracle.setRegisteredFeeds([base.address], [quote.address, ZERO_ADDRESS], [ZERO_ADDRESS])
          ).to.be.revertedWith('SET_FEEDS_INVALID_QUOTES_LENGTH')
          await expect(
            oracle.setRegisteredFeeds([base.address], [quote.address], [ZERO_ADDRESS, ZERO_ADDRESS])
          ).to.be.revertedWith('SET_FEEDS_INVALID_FEEDS_LENGTH')
        })
      })
    })

    context('when the sender is not authorized', () => {
      it('reverts', async () => {
        await expect(oracle.setRegisteredFeeds([base.address], [quote.address], [ZERO_ADDRESS])).to.be.revertedWith(
          'AUTH_SENDER_NOT_ALLOWED'
        )
      })
    })
  })

  describe('getPrice', () => {
    context('when there is no feed', () => {
      beforeEach('deploy tokens', async () => {
        base = await deploy('TokenMock', ['BASE', 18])
        quote = await deploy('TokenMock', ['QUOTE', 18])
      })

      it('reverts', async () => {
        await expect(oracle.getPrice(base.address, quote.address)).to.be.revertedWith('MISSING_BASE_PIVOT_FEED')
      })
    })

    context('when there is a direct feed', () => {
      const PRICE = bn(3)

      const itReverts = (baseDecimals: number, quoteDecimals: number) => {
        beforeEach('deploy tokens', async () => {
          base = await deploy('TokenMock', ['BASE', baseDecimals])
          quote = await deploy('TokenMock', ['QUOTE', quoteDecimals])
        })

        it('reverts', async () => {
          await expect(oracle.getPrice(base.address, quote.address)).to.be.revertedWith('BASE_DECIMALS_TOO_BIG')
        })
      }

      const itQuotesThePriceCorrectly = (baseDecimals: number, quoteDecimals: number, feedDecimals: number) => {
        const reportedPrice = PRICE.mul(bn(10).pow(feedDecimals))
        const resultDecimals = quoteDecimals + 18 - baseDecimals
        const expectedPrice = PRICE.mul(bn(10).pow(resultDecimals))

        beforeEach('deploy tokens', async () => {
          base = await deploy('TokenMock', ['BASE', baseDecimals])
          quote = await deploy('TokenMock', ['QUOTE', quoteDecimals])
        })

        beforeEach('set feed', async () => {
          const feed = await deploy('FeedMock', [reportedPrice, feedDecimals])
          await oracle.connect(admin).setFeeds([base.address], [quote.address], [feed.address])
        })

        it(`expresses the price with ${resultDecimals} decimals`, async () => {
          expect(await oracle.getPrice(base.address, quote.address)).to.be.equal(expectedPrice)
        })
      }

      context('when the base has 6 decimals', () => {
        const baseDecimals = 6

        context('when the quote has 6 decimals', () => {
          const quoteDecimals = 6

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })

        context('when the quote has 18 decimals', () => {
          const quoteDecimals = 18

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })

        context('when the quote has 20 decimals', () => {
          const quoteDecimals = 20

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })
      })

      context('when the base has 18 decimals', () => {
        const baseDecimals = 18

        context('when the quote has 6 decimals', () => {
          const quoteDecimals = 6

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })

        context('when the quote has 18 decimals', () => {
          const quoteDecimals = 18

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })

        context('when the quote has 20 decimals', () => {
          const quoteDecimals = 20

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })
      })

      context('when the base has 20 decimals', () => {
        const baseDecimals = 20

        context('when the quote has 6 decimals', () => {
          const quoteDecimals = 6

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })

        context('when the quote has 18 decimals', () => {
          const quoteDecimals = 18

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })

        context('when the quote has 20 decimals', () => {
          const quoteDecimals = 20

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })
      })

      context('when the base has 38 decimals', () => {
        const baseDecimals = 38

        context('when the quote has 6 decimals', () => {
          const quoteDecimals = 6

          itReverts(baseDecimals, quoteDecimals)
        })

        context('when the quote has 18 decimals', () => {
          const quoteDecimals = 18

          itReverts(baseDecimals, quoteDecimals)
        })

        context('when the quote has 20 decimals', () => {
          const quoteDecimals = 20

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })
      })
    })

    context('when there is an inverse feed', () => {
      const PRICE = bn(3)

      const itReverts = (baseDecimals: number, quoteDecimals: number) => {
        beforeEach('deploy tokens', async () => {
          base = await deploy('TokenMock', ['BASE', baseDecimals])
          quote = await deploy('TokenMock', ['QUOTE', quoteDecimals])
        })

        it('reverts', async () => {
          await expect(oracle.getPrice(base.address, quote.address)).to.be.revertedWith('BASE_DECIMALS_TOO_BIG')
        })
      }

      const itQuotesThePriceCorrectly = (baseDecimals: number, quoteDecimals: number, feedDecimals: number) => {
        const reportedInversePrice = bn(10).pow(feedDecimals).div(PRICE)
        const resultDecimals = quoteDecimals + 18 - baseDecimals
        const expectedPrice = PRICE.mul(bn(10).pow(resultDecimals))

        beforeEach('deploy tokens', async () => {
          base = await deploy('TokenMock', ['BASE', baseDecimals])
          quote = await deploy('TokenMock', ['QUOTE', quoteDecimals])
        })

        beforeEach('set inverse feed', async () => {
          const feed = await deploy('FeedMock', [reportedInversePrice, feedDecimals])
          await oracle.connect(admin).setFeeds([quote.address], [base.address], [feed.address])
        })

        it(`expresses the price with ${resultDecimals} decimals`, async () => {
          const price = await oracle.getPrice(base.address, quote.address)

          if (feedDecimals > 18) {
            // There is no precision error
            expect(price).to.be.eq(expectedPrice)
          } else if (resultDecimals > feedDecimals) {
            const expectedError = reportedInversePrice.mod(10).add(1)
            const errorPrecision = resultDecimals - feedDecimals
            const upscaledError = expectedError.mul(bn(10).pow(errorPrecision))
            const expectedPriceWithError = expectedPrice.add(upscaledError)
            expect(price).to.be.at.least(expectedPrice)
            expect(price).to.be.at.most(expectedPriceWithError)
          }
        })
      }

      context('when the base has 6 decimals', () => {
        const baseDecimals = 6

        context('when the quote has 6 decimals', () => {
          const quoteDecimals = 6

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })

        context('when the quote has 18 decimals', () => {
          const quoteDecimals = 18

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })

        context('when the quote has 20 decimals', () => {
          const quoteDecimals = 20

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })
      })

      context('when the base has 18 decimals', () => {
        const baseDecimals = 18

        context('when the quote has 6 decimals', () => {
          const quoteDecimals = 6

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })

        context('when the quote has 18 decimals', () => {
          const quoteDecimals = 18

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })

        context('when the quote has 20 decimals', () => {
          const quoteDecimals = 20

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })
      })

      context('when the base has 20 decimals', () => {
        const baseDecimals = 20

        context('when the quote has 6 decimals', () => {
          const quoteDecimals = 6

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })

        context('when the quote has 18 decimals', () => {
          const quoteDecimals = 18

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })

        context('when the quote has 20 decimals', () => {
          const quoteDecimals = 20

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })
      })

      context('when the base has 38 decimals', () => {
        const baseDecimals = 38

        context('when the quote has 6 decimals', () => {
          const quoteDecimals = 6

          itReverts(baseDecimals, quoteDecimals)
        })

        context('when the quote has 18 decimals', () => {
          const quoteDecimals = 18

          itReverts(baseDecimals, quoteDecimals)
        })

        context('when the quote has 20 decimals', () => {
          const quoteDecimals = 20

          context('when the feed has 6 decimals', () => {
            const feedDecimals = 6

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 18 decimals', () => {
            const feedDecimals = 18

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })

          context('when the feed has 20 decimals', () => {
            const feedDecimals = 20

            itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, feedDecimals)
          })
        })
      })
    })

    context('when there are pivot feeds', () => {
      const BASE_ETH_PRICE = bn(2)
      const QUOTE_ETH_PRICE = bn(6)

      const itReverts = (baseDecimals: number, quoteDecimals: number) => {
        beforeEach('deploy tokens', async () => {
          base = await deploy('TokenMock', ['BASE', baseDecimals])
          quote = await deploy('TokenMock', ['QUOTE', quoteDecimals])
        })

        it('reverts', async () => {
          await expect(oracle.getPrice(base.address, quote.address)).to.be.revertedWith('BASE_DECIMALS_TOO_BIG')
        })
      }

      const itQuotesThePriceCorrectly = (
        baseDecimals: number,
        quoteDecimals: number,
        baseFeedDecimals: number,
        quoteFeedDecimals: number
      ) => {
        const reportedBasePrice = BASE_ETH_PRICE.mul(bn(10).pow(baseFeedDecimals))
        const reportedQuotePrice = QUOTE_ETH_PRICE.mul(bn(10).pow(quoteFeedDecimals))
        const resultDecimals = quoteDecimals + 18 - baseDecimals
        const expectedPrice = QUOTE_ETH_PRICE.div(BASE_ETH_PRICE).mul(bn(10).pow(resultDecimals))

        beforeEach('deploy tokens', async () => {
          base = await deploy('TokenMock', ['BASE', baseDecimals])
          quote = await deploy('TokenMock', ['QUOTE', quoteDecimals])
        })

        beforeEach('set feed', async () => {
          const baseFeed = await deploy('FeedMock', [reportedBasePrice, baseFeedDecimals])
          const quoteFeed = await deploy('FeedMock', [reportedQuotePrice, quoteFeedDecimals])
          await oracle
            .connect(admin)
            .setFeeds([base.address, quote.address], [PIVOT, PIVOT], [baseFeed.address, quoteFeed.address])
        })

        it(`expresses the price with ${resultDecimals} decimals`, async () => {
          expect(await oracle.getPrice(base.address, quote.address)).to.be.equal(expectedPrice)
        })
      }

      context('when the base has 6 decimals', () => {
        const baseDecimals = 6

        context('when the quote has 6 decimals', () => {
          const quoteDecimals = 6

          context('when the base feed has 6 decimals', () => {
            const baseFeedDecimals = 6

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 18 decimals', () => {
            const baseFeedDecimals = 18

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 20 decimals', () => {
            const baseFeedDecimals = 20

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })
        })

        context('when the quote has 18 decimals', () => {
          const quoteDecimals = 18

          context('when the base feed has 6 decimals', () => {
            const baseFeedDecimals = 6

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 18 decimals', () => {
            const baseFeedDecimals = 18

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 20 decimals', () => {
            const baseFeedDecimals = 20

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })
        })

        context('when the quote has 20 decimals', () => {
          const quoteDecimals = 20

          context('when the base feed has 6 decimals', () => {
            const baseFeedDecimals = 6

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 18 decimals', () => {
            const baseFeedDecimals = 18

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 20 decimals', () => {
            const baseFeedDecimals = 20

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })
        })
      })

      context('when the base has 18 decimals', () => {
        const baseDecimals = 18

        context('when the quote has 6 decimals', () => {
          const quoteDecimals = 6

          context('when the base feed has 6 decimals', () => {
            const baseFeedDecimals = 6

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 18 decimals', () => {
            const baseFeedDecimals = 18

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 20 decimals', () => {
            const baseFeedDecimals = 20

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })
        })

        context('when the quote has 18 decimals', () => {
          const quoteDecimals = 18

          context('when the base feed has 6 decimals', () => {
            const baseFeedDecimals = 6

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 18 decimals', () => {
            const baseFeedDecimals = 18

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 20 decimals', () => {
            const baseFeedDecimals = 20

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })
        })

        context('when the quote has 20 decimals', () => {
          const quoteDecimals = 20

          context('when the base feed has 6 decimals', () => {
            const baseFeedDecimals = 6

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 18 decimals', () => {
            const baseFeedDecimals = 18

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 20 decimals', () => {
            const baseFeedDecimals = 20

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })
        })
      })

      context('when the base has 20 decimals', () => {
        const baseDecimals = 20

        context('when the quote has 6 decimals', () => {
          const quoteDecimals = 6

          context('when the base feed has 6 decimals', () => {
            const baseFeedDecimals = 6

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 18 decimals', () => {
            const baseFeedDecimals = 18

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 20 decimals', () => {
            const baseFeedDecimals = 20

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })
        })

        context('when the quote has 18 decimals', () => {
          const quoteDecimals = 18

          context('when the base feed has 6 decimals', () => {
            const baseFeedDecimals = 6

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 18 decimals', () => {
            const baseFeedDecimals = 18

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 20 decimals', () => {
            const baseFeedDecimals = 20

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })
        })

        context('when the quote has 20 decimals', () => {
          const quoteDecimals = 20

          context('when the base feed has 6 decimals', () => {
            const baseFeedDecimals = 6

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 18 decimals', () => {
            const baseFeedDecimals = 18

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 20 decimals', () => {
            const baseFeedDecimals = 20

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })
        })
      })

      context('when the base has 38 decimals', () => {
        const baseDecimals = 38

        context('when the quote has 6 decimals', () => {
          const quoteDecimals = 6

          itReverts(baseDecimals, quoteDecimals)
        })

        context('when the quote has 18 decimals', () => {
          const quoteDecimals = 18

          itReverts(baseDecimals, quoteDecimals)
        })

        context('when the quote has 20 decimals', () => {
          const quoteDecimals = 20

          context('when the base feed has 6 decimals', () => {
            const baseFeedDecimals = 6

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 18 decimals', () => {
            const baseFeedDecimals = 18

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })

          context('when the base feed has 20 decimals', () => {
            const baseFeedDecimals = 20

            context('when the quote feed has 6 decimals', () => {
              const quoteFeedDecimals = 6

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 18 decimals', () => {
              const quoteFeedDecimals = 18

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })

            context('when the quote feed has 20 decimals', () => {
              const quoteFeedDecimals = 20

              itQuotesThePriceCorrectly(baseDecimals, quoteDecimals, baseFeedDecimals, quoteFeedDecimals)
            })
          })
        })
      })
    })
  })
})
