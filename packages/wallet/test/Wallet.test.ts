import { assertEvent, BigNumberish, deploy, fp, getSigners, instanceAt } from '@mimic-fi/v2-helpers'
import { createClone } from '@mimic-fi/v2-registry'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

describe('Wallet', () => {
  let wallet: Contract, registry: Contract
  let swapConnector: Contract, priceOracle: Contract
  let admin: SignerWithAddress, other: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin, other] = await getSigners()
  })

  beforeEach('deploy wallet', async () => {
    registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [admin.address])
    wallet = await createClone(registry, admin, 'Wallet', [registry.address], [admin.address])
  })

  beforeEach('set swap connector', async () => {
    const swapConnectorImpl = await deploy('SwapConnectorMock')
    await registry.connect(admin).register(await swapConnectorImpl.NAMESPACE(), swapConnectorImpl.address)
    const tx = await wallet.connect(admin).setSwapConnector(swapConnectorImpl.address, '0x')
    const event = await assertEvent(tx, 'SwapConnectorSet')
    swapConnector = await instanceAt('SwapConnectorMock', event.args.swapConnector)
  })

  beforeEach('set price oracle', async () => {
    const oracleImpl = await deploy('PriceOracleMock')
    await registry.connect(admin).register(await oracleImpl.NAMESPACE(), oracleImpl.address)
    const tx = await wallet.connect(admin).setPriceOracle(oracleImpl.address, '0x')
    const event = await assertEvent(tx, 'PriceOracleSet')
    priceOracle = await instanceAt('PriceOracleMock', event.args.priceOracle)
  })

  describe('initialize', async () => {
    it('cannot be initialized twice', async () => {
      await expect(wallet.initialize(admin.address)).to.be.revertedWith(
        'Initializable: contract is already initialized'
      )
    })

    it('its implementation is already initialized', async () => {
      const implementation = await instanceAt('Wallet', await registry.getImplementation(wallet.address))
      await expect(implementation.initialize(admin.address)).to.be.revertedWith(
        'Initializable: contract is already initialized'
      )
    })

    it('is properly registered in the registry', async () => {
      const implementation = await registry.getImplementation(wallet.address)
      expect(await registry.isRegistered(await wallet.NAMESPACE(), implementation)).to.be.true
    })
  })

  describe('setPriceOracle', () => {
    let oracleImplementation: Contract

    before('deploy oracle implementation', async () => {
      oracleImplementation = await deploy('PriceOracleMock')
    })

    context('when the sender is authorized', async () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(admin)
      })

      context('when the implementation is registered', async () => {
        beforeEach('register implementation', async () => {
          await registry.connect(admin).register(await oracleImplementation.NAMESPACE(), oracleImplementation.address)
        })

        it('sets the implementation', async () => {
          const tx = await wallet.setPriceOracle(oracleImplementation.address, '0x')
          const event = await assertEvent(tx, 'PriceOracleSet')

          const oracle = await wallet.priceOracle()
          expect(oracle).to.be.equal(event.args.priceOracle)
          expect(await registry.getImplementation(oracle)).to.be.equal(oracleImplementation.address)
        })
      })

      context('when the implementation is not registered', async () => {
        it('reverts', async () => {
          await expect(wallet.setPriceOracle(oracleImplementation.address, '0x')).to.be.revertedWith(
            'NEW_IMPL_NOT_REGISTERED'
          )
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.setPriceOracle(oracleImplementation.address, '0x')).to.be.revertedWith(
          'AUTH_SENDER_NOT_ALLOWED'
        )
      })
    })
  })

  describe('setSwapConnector', () => {
    let swapConnectorImpl: Contract

    before('deploy oracle implementation', async () => {
      swapConnectorImpl = await deploy('SwapConnectorMock')
    })

    context('when the sender is authorized', async () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(admin)
      })

      context('when the implementation is registered', async () => {
        beforeEach('register implementation', async () => {
          await registry.connect(admin).register(await swapConnectorImpl.NAMESPACE(), swapConnectorImpl.address)
        })

        it('sets the implementation', async () => {
          const tx = await wallet.setSwapConnector(swapConnectorImpl.address, '0x')
          const event = await assertEvent(tx, 'SwapConnectorSet')

          const swapConnector = await wallet.swapConnector()
          expect(swapConnector).to.be.equal(event.args.swapConnector)
          expect(await registry.getImplementation(swapConnector)).to.be.equal(swapConnectorImpl.address)
        })
      })

      context('when the implementation is not registered', async () => {
        it('reverts', async () => {
          await expect(wallet.setSwapConnector(swapConnectorImpl.address, '0x')).to.be.revertedWith(
            'NEW_IMPL_NOT_REGISTERED'
          )
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.setSwapConnector(swapConnectorImpl.address, '0x')).to.be.revertedWith(
          'AUTH_SENDER_NOT_ALLOWED'
        )
      })
    })
  })

  describe('setStrategy', () => {
    // TODO: implement
  })

  describe('collect', () => {
    // TODO: implement
  })

  describe('join', () => {
    // TODO: implement
  })

  describe('exit', () => {
    // TODO: implement
  })

  describe('claim', () => {
    // TODO: implement
  })

  describe('swap', () => {
    let tokenIn: Contract, tokenOut: Contract

    const amount = fp(500)
    const data = '0xabcdef'
    const ORACLE_RATE = fp(0.98)

    before('deploy tokens', async () => {
      tokenIn = await deploy('TokenMock', ['USDC'])
      tokenOut = await deploy('TokenMock', ['USDT'])
    })

    beforeEach('mock price oracle rate', async () => {
      await priceOracle.mockRate(ORACLE_RATE)
    })

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        wallet = wallet.connect(admin)
      })

      context('when the given slippage is valid', () => {
        context('when the wallet has enough balance', async () => {
          beforeEach('mint tokens', async () => {
            await tokenIn.mint(wallet.address, amount)
          })

          const itSwapsAsExpected = (rate: BigNumberish, slippage: BigNumberish) => {
            const expectedAmountOut = amount.mul(rate).div(fp(1))

            beforeEach('fund swap connector', async () => {
              await tokenOut.mint(swapConnector.address, expectedAmountOut)
            })

            it('transfers the token in to the swap connector', async () => {
              const previousWalletBalance = await tokenIn.balanceOf(wallet.address)
              const previousConnectorBalance = await tokenIn.balanceOf(swapConnector.address)

              await wallet.swap(tokenIn.address, tokenOut.address, amount, slippage, data)

              const currentWalletBalance = await tokenIn.balanceOf(wallet.address)
              expect(currentWalletBalance).to.be.equal(previousWalletBalance.sub(amount))

              const currentConnectorBalance = await tokenIn.balanceOf(swapConnector.address)
              expect(currentConnectorBalance).to.be.equal(previousConnectorBalance.add(amount))
            })

            it('transfers the token out to the wallet', async () => {
              const previousWalletBalance = await tokenOut.balanceOf(wallet.address)
              const previousConnectorBalance = await tokenOut.balanceOf(swapConnector.address)

              await wallet.swap(tokenIn.address, tokenOut.address, amount, slippage, data)

              const currentWalletBalance = await tokenOut.balanceOf(wallet.address)
              expect(currentWalletBalance).to.be.equal(previousWalletBalance.add(expectedAmountOut))

              const currentConnectorBalance = await tokenOut.balanceOf(swapConnector.address)
              expect(currentConnectorBalance).to.be.equal(previousConnectorBalance.sub(expectedAmountOut))
            })

            it('updates the token balances in the wallet', async () => {
              const previousTokenInBalance = await wallet.getTokenBalance(tokenIn.address)
              const previousTokenOutBalance = await wallet.getTokenBalance(tokenOut.address)

              await wallet.swap(tokenIn.address, tokenOut.address, amount, slippage, data)

              const currentTokenInBalance = await wallet.getTokenBalance(tokenIn.address)
              expect(currentTokenInBalance).to.be.equal(previousTokenInBalance.sub(amount))

              const currentTokenOutBalance = await wallet.getTokenBalance(tokenOut.address)
              expect(currentTokenOutBalance).to.be.equal(previousTokenOutBalance.add(expectedAmountOut))
            })

            it('emits an event', async () => {
              const tx = await wallet.swap(tokenIn.address, tokenOut.address, amount, slippage, data)

              await assertEvent(tx, 'Swap', {
                tokenIn,
                tokenOut,
                slippage,
                amountIn: amount,
                amountOut: expectedAmountOut,
                data,
              })
            })
          }

          context('when the swap connector provides a worse rate', () => {
            const connectorSlippage = fp(0.01)
            const SWAP_RATE = ORACLE_RATE.mul(fp(1).sub(connectorSlippage)).div(fp(1))

            beforeEach('mock swap connector rate', async () => {
              await swapConnector.mockRate(SWAP_RATE)
            })

            context('when the user accepts that slippage', () => {
              const slippage = connectorSlippage

              itSwapsAsExpected(SWAP_RATE, slippage)
            })

            context('when the user does not accept that slippage', () => {
              const slippage = connectorSlippage.sub(1)

              beforeEach('fund swap connector', async () => {
                await tokenOut.mint(swapConnector.address, amount.mul(SWAP_RATE).div(fp(1)))
              })

              it('reverts', async () => {
                await expect(wallet.swap(tokenIn.address, tokenOut.address, amount, slippage, data)).to.be.revertedWith(
                  'SWAP_MIN_AMOUNT'
                )
              })
            })
          })

          context('when the swap connector provides the same rate', () => {
            const SWAP_RATE = ORACLE_RATE

            beforeEach('mock swap connector rate', async () => {
              await swapConnector.mockRate(SWAP_RATE)
            })

            context('when the user accepts no slippage', () => {
              const slippage = 0

              itSwapsAsExpected(SWAP_RATE, slippage)
            })

            context('when the user accepts a higher slippage', () => {
              const slippage = fp(0.2)

              itSwapsAsExpected(SWAP_RATE, slippage)
            })
          })

          context('when the swap connector provides a better rate', () => {
            const SWAP_RATE = ORACLE_RATE.add(fp(0.01))

            beforeEach('mock swap connector rate', async () => {
              await swapConnector.mockRate(SWAP_RATE)
            })

            context('when the user accepts no slippage', () => {
              const slippage = 0

              itSwapsAsExpected(SWAP_RATE, slippage)
            })

            context('when the user accepts a higher slippage', () => {
              const slippage = fp(0.2)

              itSwapsAsExpected(SWAP_RATE, slippage)
            })
          })
        })

        context('when the wallet does not have enough balance', () => {
          it('reverts', async () => {
            await expect(wallet.swap(tokenIn.address, tokenOut.address, amount, 0, data)).to.be.revertedWith(
              'ERC20: transfer amount exceeds balance'
            )
          })
        })
      })

      context('when the given slippage is not valid', () => {
        const slippage = fp(1.01)

        it('reverts', async () => {
          await expect(wallet.swap(tokenIn.address, tokenOut.address, amount, slippage, data)).to.be.revertedWith(
            'SLIPPAGE_ABOVE_ONE'
          )
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.swap(tokenIn.address, tokenOut.address, amount, 0, data)).to.be.revertedWith(
          'AUTH_SENDER_NOT_ALLOWED'
        )
      })
    })
  })

  describe('withdraw', () => {
    let token: Contract

    const amount = fp(10)
    const data = '0xabcdef'

    before('deploy token', async () => {
      token = await deploy('TokenMock', ['USDC'])
    })

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        wallet = wallet.connect(admin)
      })

      context('when the wallet has enough balance', async () => {
        beforeEach('mint tokens', async () => {
          await token.mint(wallet.address, amount)
        })

        it('transfers the tokens to the recipient', async () => {
          const previousWalletBalance = await token.balanceOf(wallet.address)
          const previousRecipientBalance = await token.balanceOf(other.address)

          await wallet.withdraw(token.address, amount, other.address, data)

          const currentWalletBalance = await token.balanceOf(wallet.address)
          expect(currentWalletBalance).to.be.equal(previousWalletBalance.sub(amount))

          const currentRecipientBalance = await token.balanceOf(other.address)
          expect(currentRecipientBalance).to.be.equal(previousRecipientBalance.add(amount))
        })

        it('decreases the token balance in the wallet', async () => {
          const previousBalance = await wallet.getTokenBalance(token.address)

          await wallet.withdraw(token.address, amount, other.address, data)

          const currentBalance = await wallet.getTokenBalance(token.address)
          expect(currentBalance).to.be.equal(previousBalance.sub(amount))
        })

        it('emits an event', async () => {
          const tx = await wallet.withdraw(token.address, amount, other.address, data)

          await assertEvent(tx, 'Withdraw', { token, amount, recipient: other, data })
        })
      })

      context('when the wallet does not have enough balance', async () => {
        it('reverts', async () => {
          await expect(wallet.withdraw(token.address, amount, other.address, data)).to.be.revertedWith(
            'ERC20: transfer amount exceeds balance'
          )
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.withdraw(token.address, 0, other.address, '0x')).to.be.revertedWith(
          'AUTH_SENDER_NOT_ALLOWED'
        )
      })
    })
  })
})
