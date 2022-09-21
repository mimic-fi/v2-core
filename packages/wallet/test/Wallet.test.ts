import {
  advanceTime,
  assertEvent,
  assertIndirectEvent,
  BigNumberish,
  bn,
  currentTimestamp,
  deploy,
  fp,
  getSigners,
  instanceAt,
  MONTH,
  NATIVE_TOKEN_ADDRESS,
  ZERO_ADDRESS,
} from '@mimic-fi/v2-helpers'
import { createClone } from '@mimic-fi/v2-registry'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { ethers } from 'hardhat'

describe('Wallet', () => {
  let wallet: Contract, registry: Contract
  let strategy: Contract, priceOracle: Contract, swapConnector: Contract, wrappedNativeToken: Contract
  let admin: SignerWithAddress, other: SignerWithAddress, feeCollector: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin, other, feeCollector] = await getSigners()
  })

  beforeEach('deploy wallet', async () => {
    registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [admin.address])
    wrappedNativeToken = await deploy('WrappedNativeTokenMock')
    wallet = await createClone(
      registry,
      admin,
      'Wallet',
      [wrappedNativeToken.address, registry.address],
      [admin.address]
    )
  })

  beforeEach('deploy wallet dependencies', async () => {
    const setFeeCollectorRole = wallet.interface.getSighash('setFeeCollector')
    await wallet.connect(admin).authorize(admin.address, setFeeCollectorRole)
    await wallet.connect(admin).setFeeCollector(feeCollector.address)

    const setStrategyRole = wallet.interface.getSighash('setStrategy')
    await wallet.connect(admin).authorize(admin.address, setStrategyRole)
    strategy = await createClone(registry, admin, 'StrategyMock', [registry.address], [])
    await wallet.connect(admin).setStrategy(strategy.address)

    const setPriceOracleRole = wallet.interface.getSighash('setPriceOracle')
    await wallet.connect(admin).authorize(admin.address, setPriceOracleRole)
    priceOracle = await createClone(registry, admin, 'PriceOracleMock', [registry.address])
    await wallet.connect(admin).setPriceOracle(priceOracle.address)

    const setSwapConnectorRole = wallet.interface.getSighash('setSwapConnector')
    await wallet.connect(admin).authorize(admin.address, setSwapConnectorRole)
    swapConnector = await createClone(registry, admin, 'SwapConnectorMock', [registry.address])
    await wallet.connect(admin).setSwapConnector(swapConnector.address)
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

  describe('setStrategy', () => {
    let newStrategy: Contract

    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setStrategyRole = wallet.interface.getSighash('setStrategy')
        await wallet.connect(admin).authorize(admin.address, setStrategyRole)
        wallet = wallet.connect(admin)
      })

      context('when the implementation was already set', async () => {
        it('reverts', async () => {
          await expect(wallet.setStrategy(ZERO_ADDRESS)).to.be.revertedWith('WALLET_STRATEGY_ALREADY_SET')
        })
      })

      context('when the implementation was not set', async () => {
        beforeEach('deploy another wallet', async () => {
          wallet = await createClone(
            registry,
            admin,
            'Wallet',
            [wrappedNativeToken.address, registry.address],
            [admin.address]
          )
          const setStrategyRole = wallet.interface.getSighash('setStrategy')
          await wallet.connect(admin).authorize(admin.address, setStrategyRole)
          wallet = wallet.connect(admin)
        })

        context('when the implementation is registered', async () => {
          beforeEach('deploy implementation', async () => {
            newStrategy = await createClone(registry, admin, 'StrategyMock', [registry.address], [])
          })

          it('sets the implementation', async () => {
            await wallet.setStrategy(newStrategy.address)

            expect(await wallet.strategy()).to.be.equal(newStrategy.address)
          })

          it('emits an event', async () => {
            const tx = await wallet.setStrategy(newStrategy.address)
            await assertEvent(tx, 'StrategySet', { strategy: newStrategy })
          })
        })

        context('when the implementation is not registered', async () => {
          beforeEach('deploy implementation', async () => {
            newStrategy = await deploy('StrategyMock', [registry.address])
          })

          it('reverts', async () => {
            await expect(wallet.setStrategy(newStrategy.address)).to.be.revertedWith('NEW_DEPENDENCY_NOT_REGISTERED')
          })
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.setStrategy(ZERO_ADDRESS)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setPriceOracle', () => {
    let newOracle: Contract

    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setPriceOracleRole = wallet.interface.getSighash('setPriceOracle')
        await wallet.connect(admin).authorize(admin.address, setPriceOracleRole)
        wallet = wallet.connect(admin)
      })

      context('when the implementation is registered', async () => {
        beforeEach('deploy implementation', async () => {
          newOracle = await createClone(registry, admin, 'PriceOracleMock', [registry.address])
        })

        it('sets the implementation', async () => {
          await wallet.setPriceOracle(newOracle.address)

          const oracle = await wallet.priceOracle()
          expect(oracle).to.be.equal(newOracle.address)
        })

        it('emits an event', async () => {
          const tx = await wallet.setPriceOracle(newOracle.address)
          await assertEvent(tx, 'PriceOracleSet', { priceOracle: newOracle })
        })
      })

      context('when the implementation is not registered', async () => {
        beforeEach('deploy implementation', async () => {
          newOracle = await deploy('PriceOracleMock', [registry.address])
        })

        it('reverts', async () => {
          await expect(wallet.setPriceOracle(newOracle.address)).to.be.revertedWith('NEW_DEPENDENCY_NOT_REGISTERED')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.setPriceOracle(ZERO_ADDRESS)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setSwapConnector', () => {
    let newSwapConnector: Contract

    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setSwapConnectorRole = wallet.interface.getSighash('setSwapConnector')
        await wallet.connect(admin).authorize(admin.address, setSwapConnectorRole)
        wallet = wallet.connect(admin)
      })

      context('when the implementation is registered', async () => {
        beforeEach('deploy implementation', async () => {
          newSwapConnector = await createClone(registry, admin, 'SwapConnectorMock', [registry.address])
        })

        it('sets the implementation', async () => {
          await wallet.setSwapConnector(newSwapConnector.address)

          const swapConnector = await wallet.swapConnector()
          expect(swapConnector).to.be.equal(newSwapConnector.address)
        })

        it('emits an event', async () => {
          const tx = await wallet.setSwapConnector(newSwapConnector.address)
          await assertEvent(tx, 'SwapConnectorSet', { swapConnector: newSwapConnector })
        })
      })

      context('when the implementation is not registered', async () => {
        beforeEach('deploy implementation', async () => {
          newSwapConnector = await deploy('SwapConnectorMock', [registry.address])
        })

        it('reverts', async () => {
          await expect(wallet.setSwapConnector(newSwapConnector.address)).to.be.revertedWith(
            'NEW_DEPENDENCY_NOT_REGISTERED'
          )
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.setSwapConnector(ZERO_ADDRESS)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setFeeCollector', () => {
    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setFeeCollectorRole = wallet.interface.getSighash('setFeeCollector')
        await wallet.connect(admin).authorize(admin.address, setFeeCollectorRole)
        wallet = wallet.connect(admin)
      })

      context('when the new address is not zero', async () => {
        let newFeeCollector: SignerWithAddress

        beforeEach('set new fee collector', async () => {
          newFeeCollector = other
        })

        it('sets the fee collector', async () => {
          await wallet.setFeeCollector(newFeeCollector.address)

          const collector = await wallet.feeCollector()
          expect(collector).to.be.equal(newFeeCollector.address)
        })

        it('emits an event', async () => {
          const tx = await wallet.setFeeCollector(newFeeCollector.address)
          await assertEvent(tx, 'FeeCollectorSet', { feeCollector: newFeeCollector })
        })
      })

      context('when the new address is zero', async () => {
        const newFeeCollector = ZERO_ADDRESS

        it('reverts', async () => {
          await expect(wallet.setFeeCollector(newFeeCollector)).to.be.revertedWith('FEE_COLLECTOR_ZERO')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.setFeeCollector(ZERO_ADDRESS)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setWithdrawFee', () => {
    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setWithdrawFeeRole = wallet.interface.getSighash('setWithdrawFee')
        await wallet.connect(admin).authorize(admin.address, setWithdrawFeeRole)
        wallet = wallet.connect(admin)
      })

      context('when there was no withdraw fee set yet', () => {
        context('when the pct is below one', async () => {
          const itSetsTheFeeCorrectly = (pct: BigNumberish, cap: BigNumberish, token: string, period: BigNumberish) => {
            it('sets the withdraw fee', async () => {
              await wallet.setWithdrawFee(pct, cap, token, period)

              const now = await currentTimestamp()
              const fee = await wallet.withdrawFee()
              expect(fee.pct).to.be.equal(pct)
              expect(fee.cap).to.be.equal(cap)
              expect(fee.token).to.be.equal(token)
              expect(fee.period).to.be.equal(period)
              expect(fee.totalCharged).to.be.equal(0)
              expect(fee.nextResetTime).to.be.equal(cap != 0 ? now.add(period) : 0)
            })

            it('emits an event', async () => {
              const tx = await wallet.setWithdrawFee(pct, cap, token, period)
              await assertEvent(tx, 'WithdrawFeeSet', { pct, cap, token, period })
            })
          }

          context('when the pct is not zero', async () => {
            const pct = fp(0.01)

            context('when the cap is not zero', async () => {
              const cap = fp(100)

              context('when the token is not zero', async () => {
                const token = NATIVE_TOKEN_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  itSetsTheFeeCorrectly(pct, cap, token, period)
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })
              })

              context('when the token is zero', async () => {
                const token = ZERO_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })
              })
            })

            context('when the cap is zero', async () => {
              const cap = 0

              context('when the token is not zero', async () => {
                const token = NATIVE_TOKEN_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })
              })

              context('when the token is zero', async () => {
                const token = ZERO_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  itSetsTheFeeCorrectly(pct, cap, token, period)
                })
              })
            })
          })

          context('when the pct is zero', async () => {
            const pct = 0

            context('when the cap is not zero', async () => {
              const cap = fp(100)

              context('when the token is not zero', async () => {
                const token = NATIVE_TOKEN_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })
              })

              context('when the token is zero', async () => {
                const token = ZERO_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })
              })
            })

            context('when the cap is zero', async () => {
              const cap = 0

              context('when the token is not zero', async () => {
                const token = NATIVE_TOKEN_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })
              })

              context('when the token is zero', async () => {
                const token = ZERO_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  itSetsTheFeeCorrectly(pct, cap, token, period)
                })
              })
            })
          })
        })

        context('when the pct is above one', async () => {
          const pct = fp(1.01)

          it('reverts', async () => {
            await expect(wallet.setWithdrawFee(pct, 0, ZERO_ADDRESS, 0)).to.be.revertedWith('FEE_PCT_ABOVE_ONE')
          })
        })
      })

      context('when there was a withdraw fee already set', () => {
        const pct = fp(0.01)
        const cap = fp(200)
        const period = MONTH * 2
        const token = NATIVE_TOKEN_ADDRESS

        beforeEach('set withdraw fee', async () => {
          await wallet.setWithdrawFee(pct, cap, token, period)
        })

        context('when there was no charged fees yet', () => {
          const rate = 2
          const newPct = pct.mul(rate)
          const newCap = cap.mul(rate)
          const newPeriod = period * rate
          let newToken: Contract

          beforeEach('deploy new token', async () => {
            newToken = await deploy('TokenMock', ['TKN'])
            await priceOracle.mockRate(token, newToken.address, fp(rate))
          })

          it('sets the withdraw fee without updating the next reset time', async () => {
            const { nextResetTime: previousResetTime } = await wallet.withdrawFee()

            await wallet.setWithdrawFee(newPct, newCap, newToken.address, newPeriod)

            const fee = await wallet.withdrawFee()
            expect(fee.pct).to.be.equal(newPct)
            expect(fee.cap).to.be.equal(newCap)
            expect(fee.token).to.be.equal(newToken.address)
            expect(fee.period).to.be.equal(newPeriod)
            expect(fee.totalCharged).to.be.equal(0)
            expect(fee.nextResetTime).to.be.equal(previousResetTime)
          })

          it('emits an event', async () => {
            const tx = await wallet.setWithdrawFee(newPct, newCap, newToken.address, newPeriod)
            await assertEvent(tx, 'WithdrawFeeSet', { pct: newPct, cap: newCap, token: newToken, period: newPeriod })
          })
        })

        context('when there where some charged fees already', () => {
          let newToken: Contract

          beforeEach('deploy token', async () => {
            newToken = await deploy('TokenMock', ['TKN'])
          })

          beforeEach('accrue withdraw fee', async () => {
            const amount = fp(10)
            await newToken.mint(wallet.address, amount)
            const withdrawRole = wallet.interface.getSighash('withdraw')
            await wallet.connect(admin).authorize(admin.address, withdrawRole)
            await wallet.withdraw(newToken.address, amount, other.address, '0x')
          })

          context('when the fee cap is being changed', () => {
            const rate = 2
            const newPct = pct.mul(rate)
            const newCap = cap.mul(rate)
            const newPeriod = period * rate

            beforeEach('mock new token rate', async () => {
              await priceOracle.mockRate(token, newToken.address, fp(rate))
            })

            it('sets the withdraw fee without updating the next reset time', async () => {
              const previousFeeData = await wallet.withdrawFee()

              await wallet.setWithdrawFee(newPct, newCap, newToken.address, newPeriod)

              const fee = await wallet.withdrawFee()
              expect(fee.pct).to.be.equal(newPct)
              expect(fee.cap).to.be.equal(newCap)
              expect(fee.token).to.be.equal(newToken.address)
              expect(fee.period).to.be.equal(newPeriod)
              expect(fee.totalCharged).to.be.equal(previousFeeData.totalCharged.mul(rate))
              expect(fee.nextResetTime).to.be.equal(previousFeeData.nextResetTime)
            })

            it('emits an event', async () => {
              const tx = await wallet.setWithdrawFee(newPct, newCap, newToken.address, newPeriod)
              await assertEvent(tx, 'WithdrawFeeSet', { pct: newPct, cap: newCap, token: newToken, period: newPeriod })
            })
          })

          context('when the fee cap is being removed', () => {
            const newPct = fp(0.3)
            const newCap = 0
            const newPeriod = 0
            const newToken = ZERO_ADDRESS

            it('sets the withdraw fee and resets the totalizators', async () => {
              await wallet.setWithdrawFee(newPct, newCap, newToken, newPeriod)

              const fee = await wallet.withdrawFee()
              expect(fee.pct).to.be.equal(newPct)
              expect(fee.cap).to.be.equal(newCap)
              expect(fee.token).to.be.equal(newToken)
              expect(fee.period).to.be.equal(newPeriod)
              expect(fee.totalCharged).to.be.equal(0)
              expect(fee.nextResetTime).to.be.equal(0)
            })

            it('emits an event', async () => {
              const tx = await wallet.setWithdrawFee(newPct, newCap, newToken, newPeriod)
              await assertEvent(tx, 'WithdrawFeeSet', { pct: newPct, cap: newCap, token: newToken, period: newPeriod })
            })
          })
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.setWithdrawFee(0, 0, ZERO_ADDRESS, 0)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setPerformanceFee', () => {
    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setPerformanceFeeRole = wallet.interface.getSighash('setPerformanceFee')
        await wallet.connect(admin).authorize(admin.address, setPerformanceFeeRole)
        wallet = wallet.connect(admin)
      })

      context('when there was no performance fee set yet', () => {
        context('when the pct is below one', async () => {
          const itSetsTheFeeCorrectly = (pct: BigNumberish, cap: BigNumberish, token: string, period: BigNumberish) => {
            it('sets the performance fee', async () => {
              await wallet.setPerformanceFee(pct, cap, token, period)

              const now = await currentTimestamp()
              const fee = await wallet.performanceFee()
              expect(fee.pct).to.be.equal(pct)
              expect(fee.cap).to.be.equal(cap)
              expect(fee.token).to.be.equal(token)
              expect(fee.period).to.be.equal(period)
              expect(fee.totalCharged).to.be.equal(0)
              expect(fee.nextResetTime).to.be.equal(cap != 0 ? now.add(period) : 0)
            })

            it('emits an event', async () => {
              const tx = await wallet.setPerformanceFee(pct, cap, token, period)
              await assertEvent(tx, 'PerformanceFeeSet', { pct, cap, token, period })
            })
          }

          context('when the pct is not zero', async () => {
            const pct = fp(0.01)

            context('when the cap is not zero', async () => {
              const cap = fp(100)

              context('when the token is not zero', async () => {
                const token = NATIVE_TOKEN_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  itSetsTheFeeCorrectly(pct, cap, token, period)
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })
              })

              context('when the token is zero', async () => {
                const token = ZERO_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })
              })
            })

            context('when the cap is zero', async () => {
              const cap = 0

              context('when the token is not zero', async () => {
                const token = NATIVE_TOKEN_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })
              })

              context('when the token is zero', async () => {
                const token = ZERO_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  itSetsTheFeeCorrectly(pct, cap, token, period)
                })
              })
            })
          })

          context('when the pct is zero', async () => {
            const pct = 0

            context('when the cap is not zero', async () => {
              const cap = fp(100)

              context('when the token is not zero', async () => {
                const token = NATIVE_TOKEN_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })
              })

              context('when the token is zero', async () => {
                const token = ZERO_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })
              })
            })

            context('when the cap is zero', async () => {
              const cap = 0

              context('when the token is not zero', async () => {
                const token = NATIVE_TOKEN_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })
              })

              context('when the token is zero', async () => {
                const token = ZERO_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  itSetsTheFeeCorrectly(pct, cap, token, period)
                })
              })
            })
          })
        })

        context('when the pct is above one', async () => {
          const pct = fp(1.01)

          it('reverts', async () => {
            await expect(wallet.setPerformanceFee(pct, 0, ZERO_ADDRESS, 0)).to.be.revertedWith('FEE_PCT_ABOVE_ONE')
          })
        })
      })

      context('when there was a performance fee already set', () => {
        const pct = fp(0.01)
        const cap = fp(200)
        const period = MONTH * 2
        const token = NATIVE_TOKEN_ADDRESS

        beforeEach('set performance fee', async () => {
          await wallet.setPerformanceFee(pct, cap, token, period)
        })

        context('when there was no charged fees yet', () => {
          const rate = 2
          const newPct = pct.mul(rate)
          const newCap = cap.mul(rate)
          const newPeriod = period * rate
          let newToken: Contract

          beforeEach('deploy new token', async () => {
            newToken = await deploy('TokenMock', ['TKN'])
            await priceOracle.mockRate(token, newToken.address, fp(rate))
          })

          it('sets the performance fee without updating the next reset time', async () => {
            const { nextResetTime: previousResetTime } = await wallet.performanceFee()

            await wallet.setPerformanceFee(newPct, newCap, newToken.address, newPeriod)

            const fee = await wallet.performanceFee()
            expect(fee.pct).to.be.equal(newPct)
            expect(fee.cap).to.be.equal(newCap)
            expect(fee.token).to.be.equal(newToken.address)
            expect(fee.period).to.be.equal(newPeriod)
            expect(fee.totalCharged).to.be.equal(0)
            expect(fee.nextResetTime).to.be.equal(previousResetTime)
          })

          it('emits an event', async () => {
            const tx = await wallet.setPerformanceFee(newPct, newCap, newToken.address, newPeriod)
            await assertEvent(tx, 'PerformanceFeeSet', { pct: newPct, cap: newCap, token: newToken, period: newPeriod })
          })
        })

        context('when there where some charged fees already', () => {
          let newToken: Contract

          beforeEach('deploy token', async () => {
            newToken = await deploy('TokenMock', ['TKN'])
          })

          beforeEach('accrue performance fee', async () => {
            const joinRole = wallet.interface.getSighash('join')
            await wallet.connect(admin).authorize(admin.address, joinRole)
            const exitRole = wallet.interface.getSighash('exit')
            await wallet.connect(admin).authorize(admin.address, exitRole)

            const amount = fp(50)
            const token = await instanceAt('TokenMock', await strategy.token())
            await token.mint(wallet.address, amount)
            await wallet.join(amount, 0, '0x')
            await strategy.mockGains(2)
            await wallet.exit(fp(1), 0, '0x')
          })

          context('when the fee cap is being changed', () => {
            const rate = 2
            const newPct = pct.mul(rate)
            const newCap = cap.mul(rate)
            const newPeriod = period * rate

            beforeEach('mock new token rate', async () => {
              await priceOracle.mockRate(token, newToken.address, fp(rate))
            })

            it('sets the performance fee without updating the next reset time', async () => {
              const previousFeeData = await wallet.performanceFee()

              await wallet.setPerformanceFee(newPct, newCap, newToken.address, newPeriod)

              const fee = await wallet.performanceFee()
              expect(fee.pct).to.be.equal(newPct)
              expect(fee.cap).to.be.equal(newCap)
              expect(fee.token).to.be.equal(newToken.address)
              expect(fee.period).to.be.equal(newPeriod)
              expect(fee.totalCharged).to.be.equal(previousFeeData.totalCharged.mul(rate))
              expect(fee.nextResetTime).to.be.equal(previousFeeData.nextResetTime)
            })

            it('emits an event', async () => {
              const tx = await wallet.setPerformanceFee(newPct, newCap, newToken.address, newPeriod)
              await assertEvent(tx, 'PerformanceFeeSet', {
                pct: newPct,
                cap: newCap,
                token: newToken,
                period: newPeriod,
              })
            })
          })

          context('when the fee cap is being removed', () => {
            const newPct = fp(0.3)
            const newCap = 0
            const newPeriod = 0
            const newToken = ZERO_ADDRESS

            it('sets the performance fee and resets the totalizators', async () => {
              await wallet.setPerformanceFee(newPct, newCap, newToken, newPeriod)

              const fee = await wallet.performanceFee()
              expect(fee.pct).to.be.equal(newPct)
              expect(fee.cap).to.be.equal(newCap)
              expect(fee.token).to.be.equal(newToken)
              expect(fee.period).to.be.equal(newPeriod)
              expect(fee.totalCharged).to.be.equal(0)
              expect(fee.nextResetTime).to.be.equal(0)
            })

            it('emits an event', async () => {
              const tx = await wallet.setPerformanceFee(newPct, newCap, newToken, newPeriod)
              await assertEvent(tx, 'PerformanceFeeSet', {
                pct: newPct,
                cap: newCap,
                token: newToken,
                period: newPeriod,
              })
            })
          })
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.setPerformanceFee(0, 0, ZERO_ADDRESS, 0)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setSwapFee', () => {
    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setSwapFeeRole = wallet.interface.getSighash('setSwapFee')
        await wallet.connect(admin).authorize(admin.address, setSwapFeeRole)
        wallet = wallet.connect(admin)
      })

      context('when there was no swap fee set yet', () => {
        context('when the pct is below one', async () => {
          const itSetsTheFeeCorrectly = (pct: BigNumberish, cap: BigNumberish, token: string, period: BigNumberish) => {
            it('sets the swap fee', async () => {
              await wallet.setSwapFee(pct, cap, token, period)

              const now = await currentTimestamp()
              const fee = await wallet.swapFee()
              expect(fee.pct).to.be.equal(pct)
              expect(fee.cap).to.be.equal(cap)
              expect(fee.token).to.be.equal(token)
              expect(fee.period).to.be.equal(period)
              expect(fee.totalCharged).to.be.equal(0)
              expect(fee.nextResetTime).to.be.equal(cap != 0 ? now.add(period) : 0)
            })

            it('emits an event', async () => {
              const tx = await wallet.setSwapFee(pct, cap, token, period)
              await assertEvent(tx, 'SwapFeeSet', { pct, cap, token, period })
            })
          }

          context('when the pct is not zero', async () => {
            const pct = fp(0.01)

            context('when the cap is not zero', async () => {
              const cap = fp(100)

              context('when the token is not zero', async () => {
                const token = NATIVE_TOKEN_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  itSetsTheFeeCorrectly(pct, cap, token, period)
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })
              })

              context('when the token is zero', async () => {
                const token = ZERO_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })
              })
            })

            context('when the cap is zero', async () => {
              const cap = 0

              context('when the token is not zero', async () => {
                const token = NATIVE_TOKEN_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })
              })

              context('when the token is zero', async () => {
                const token = ZERO_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  itSetsTheFeeCorrectly(pct, cap, token, period)
                })
              })
            })
          })

          context('when the pct is zero', async () => {
            const pct = 0

            context('when the cap is not zero', async () => {
              const cap = fp(100)

              context('when the token is not zero', async () => {
                const token = NATIVE_TOKEN_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })
              })

              context('when the token is zero', async () => {
                const token = ZERO_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })
              })
            })

            context('when the cap is zero', async () => {
              const cap = 0

              context('when the token is not zero', async () => {
                const token = NATIVE_TOKEN_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(wallet.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })
              })

              context('when the token is zero', async () => {
                const token = ZERO_ADDRESS

                context('when the cap period is not zero', async () => {
                  const period = MONTH

                  it('reverts', async () => {
                    await expect(wallet.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  itSetsTheFeeCorrectly(pct, cap, token, period)
                })
              })
            })
          })
        })

        context('when the pct is above one', async () => {
          const pct = fp(1.01)

          it('reverts', async () => {
            await expect(wallet.setSwapFee(pct, 0, ZERO_ADDRESS, 0)).to.be.revertedWith('FEE_PCT_ABOVE_ONE')
          })
        })
      })

      context('when there was a swap fee already set', () => {
        const pct = fp(0.01)
        const cap = fp(200)
        const period = MONTH * 2
        const token = NATIVE_TOKEN_ADDRESS

        beforeEach('set swap fee', async () => {
          await wallet.setSwapFee(pct, cap, token, period)
        })

        context('when there was no charged fees yet', () => {
          const rate = 2
          const newPct = pct.mul(rate)
          const newCap = cap.mul(rate)
          const newPeriod = period * rate
          let newToken: Contract

          beforeEach('deploy new token', async () => {
            newToken = await deploy('TokenMock', ['TKN'])
            await priceOracle.mockRate(token, newToken.address, fp(rate))
          })

          it('sets the swap fee without updating the next reset time', async () => {
            const { nextResetTime: previousResetTime } = await wallet.swapFee()

            await wallet.setSwapFee(newPct, newCap, newToken.address, newPeriod)

            const fee = await wallet.swapFee()
            expect(fee.pct).to.be.equal(newPct)
            expect(fee.cap).to.be.equal(newCap)
            expect(fee.token).to.be.equal(newToken.address)
            expect(fee.period).to.be.equal(newPeriod)
            expect(fee.totalCharged).to.be.equal(0)
            expect(fee.nextResetTime).to.be.equal(previousResetTime)
          })

          it('emits an event', async () => {
            const tx = await wallet.setSwapFee(newPct, newCap, newToken.address, newPeriod)
            await assertEvent(tx, 'SwapFeeSet', { pct: newPct, cap: newCap, token: newToken, period: newPeriod })
          })
        })

        context('when there where some charged fees already', () => {
          let newToken: Contract

          beforeEach('deploy token', async () => {
            newToken = await deploy('TokenMock', ['TKN'])
          })

          beforeEach('accrue swap fee', async () => {
            const swapRole = wallet.interface.getSighash('swap')
            await wallet.connect(admin).authorize(admin.address, swapRole)

            const amount = fp(10)
            const anotherToken = await deploy('TokenMock', ['TKN'])
            await anotherToken.mint(wallet.address, amount)
            await newToken.mint(swapConnector.address, amount)
            await swapConnector.mockRate(fp(1))
            await wallet.swap(0, anotherToken.address, newToken.address, amount, 1, 0, '0x')
          })

          context('when the fee cap is being changed', () => {
            const rate = 2
            const newPct = pct.mul(rate)
            const newCap = cap.mul(rate)
            const newPeriod = period * rate

            beforeEach('mock new token rate', async () => {
              await priceOracle.mockRate(token, newToken.address, fp(rate))
            })

            it('sets the swap fee without updating the next reset time', async () => {
              const previousFeeData = await wallet.swapFee()

              await wallet.setSwapFee(newPct, newCap, newToken.address, newPeriod)

              const fee = await wallet.swapFee()
              expect(fee.pct).to.be.equal(newPct)
              expect(fee.cap).to.be.equal(newCap)
              expect(fee.token).to.be.equal(newToken.address)
              expect(fee.period).to.be.equal(newPeriod)
              expect(fee.totalCharged).to.be.equal(previousFeeData.totalCharged.mul(rate))
              expect(fee.nextResetTime).to.be.equal(previousFeeData.nextResetTime)
            })

            it('emits an event', async () => {
              const tx = await wallet.setSwapFee(newPct, newCap, newToken.address, newPeriod)
              await assertEvent(tx, 'SwapFeeSet', { pct: newPct, cap: newCap, token: newToken, period: newPeriod })
            })
          })

          context('when the fee cap is being removed', () => {
            const newPct = fp(0.3)
            const newCap = 0
            const newPeriod = 0
            const newToken = ZERO_ADDRESS

            it('sets the swap fee and resets the totalizators', async () => {
              await wallet.setSwapFee(newPct, newCap, newToken, newPeriod)

              const fee = await wallet.swapFee()
              expect(fee.pct).to.be.equal(newPct)
              expect(fee.cap).to.be.equal(newCap)
              expect(fee.token).to.be.equal(newToken)
              expect(fee.period).to.be.equal(newPeriod)
              expect(fee.totalCharged).to.be.equal(0)
              expect(fee.nextResetTime).to.be.equal(0)
            })

            it('emits an event', async () => {
              const tx = await wallet.setSwapFee(newPct, newCap, newToken, newPeriod)
              await assertEvent(tx, 'SwapFeeSet', { pct: newPct, cap: newCap, token: newToken, period: newPeriod })
            })
          })
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.setSwapFee(0, 0, ZERO_ADDRESS, 0)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('call', () => {
    const value = fp(0.01)
    let target: Contract

    beforeEach('deploy target', async () => {
      target = await deploy('ContractMock')
    })

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const callRole = wallet.interface.getSighash('call')
        await wallet.connect(admin).authorize(admin.address, callRole)
        wallet = wallet.connect(admin)
      })

      context('when the call succeeds', () => {
        let data: string

        beforeEach('encode call', async () => {
          data = target.interface.encodeFunctionData('call')
        })

        it('calls the target contract', async () => {
          await admin.sendTransaction({ to: wallet.address, value })
          const previousWalletBalance = await ethers.provider.getBalance(wallet.address)
          const previousTargetBalance = await ethers.provider.getBalance(target.address)

          const tx = await wallet.call(target.address, data, value)
          await assertEvent(tx, 'Call', { target, value, data })
          await assertIndirectEvent(tx, target.interface, 'Received', { sender: wallet, value })

          const currentWalletBalance = await ethers.provider.getBalance(wallet.address)
          expect(currentWalletBalance).to.be.equal(previousWalletBalance.sub(value))

          const currentTargetBalance = await ethers.provider.getBalance(target.address)
          expect(currentTargetBalance).to.be.equal(previousTargetBalance.add(value))
        })
      })

      context('when the call does not succeeds', () => {
        const data = '0xabcdef12' // random

        it('reverts', async () => {
          await admin.sendTransaction({ to: wallet.address, value })
          await expect(wallet.call(target.address, data, value)).to.be.revertedWith('WALLET_ARBITRARY_CALL_FAILED')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.call(target.address, '0x', value)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('collect', () => {
    let token: Contract
    let from: SignerWithAddress

    const amount = fp(10)
    const data = '0xabcdef'

    before('deploy token', async () => {
      from = admin
      token = await deploy('TokenMock', ['USDC'])
    })

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const collectRole = wallet.interface.getSighash('collect')
        await wallet.connect(admin).authorize(admin.address, collectRole)
        wallet = wallet.connect(admin)
      })

      context('when the wallet has enough allowance', () => {
        beforeEach('allow tokens', async () => {
          await token.mint(from.address, amount)
          await token.connect(from).approve(wallet.address, amount)
        })

        it('transfers the tokens to the wallet', async () => {
          const previousHolderBalance = await token.balanceOf(from.address)
          const previousWalletBalance = await token.balanceOf(wallet.address)

          await wallet.collect(token.address, from.address, amount, data)

          const currentHolderBalance = await token.balanceOf(from.address)
          expect(currentHolderBalance).to.be.equal(previousHolderBalance.sub(amount))

          const currentWalletBalance = await token.balanceOf(wallet.address)
          expect(currentWalletBalance).to.be.equal(previousWalletBalance.add(amount))
        })

        it('emits an event', async () => {
          const tx = await wallet.collect(token.address, from.address, amount, data)

          await assertEvent(tx, 'Collect', { token, from, amount, data })
        })
      })

      context('when the wallet does not have enough allowance', () => {
        beforeEach('allow tokens', async () => {
          await token.mint(admin.address, amount)
          await token.connect(admin).approve(wallet.address, amount.sub(1))
        })

        it('reverts', async () => {
          await expect(wallet.collect(token.address, from.address, amount, data)).to.be.revertedWith(
            'ERC20: insufficient allowance'
          )
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.collect(token.address, from.address, amount, data)).to.be.revertedWith(
          'AUTH_SENDER_NOT_ALLOWED'
        )
      })
    })
  })

  describe('withdraw', () => {
    const amount = fp(10)
    const data = '0xabcdef'

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const withdrawRole = wallet.interface.getSighash('withdraw')
        await wallet.connect(admin).authorize(admin.address, withdrawRole)
        wallet = wallet.connect(admin)
      })

      context('when withdrawing erc20 tokens', async () => {
        let token: Contract

        before('deploy token', async () => {
          token = await deploy('TokenMock', ['USDC'])
        })

        context('when the wallet has enough balance', async () => {
          beforeEach('mint tokens', async () => {
            await token.mint(wallet.address, amount)
          })

          context('without withdraw fees', async () => {
            it('transfers the tokens to the recipient', async () => {
              const previousWalletBalance = await token.balanceOf(wallet.address)
              const previousRecipientBalance = await token.balanceOf(other.address)

              await wallet.withdraw(token.address, amount, other.address, data)

              const currentWalletBalance = await token.balanceOf(wallet.address)
              expect(currentWalletBalance).to.be.equal(previousWalletBalance.sub(amount))

              const currentRecipientBalance = await token.balanceOf(other.address)
              expect(currentRecipientBalance).to.be.equal(previousRecipientBalance.add(amount))
            })

            it('emits an event', async () => {
              const tx = await wallet.withdraw(token.address, amount, other.address, data)

              await assertEvent(tx, 'Withdraw', { token, amount, recipient: other, fee: 0, data })
            })
          })

          context('with withdraw fees', async () => {
            const withdrawFee = fp(0.01)
            const withdrawFeeAmount = amount.mul(withdrawFee).div(fp(1))

            beforeEach('authorize', async () => {
              const setWithdrawFeeRole = wallet.interface.getSighash('setWithdrawFee')
              await wallet.connect(admin).authorize(admin.address, setWithdrawFeeRole)
            })

            const itWithdrawsCorrectly = (expectedChargedFees: BigNumber) => {
              const amountAfterFees = amount.sub(expectedChargedFees)

              it('transfers the tokens to the recipient', async () => {
                const previousWalletBalance = await token.balanceOf(wallet.address)
                const previousRecipientBalance = await token.balanceOf(other.address)
                const previousFeeCollectorBalance = await token.balanceOf(feeCollector.address)

                await wallet.withdraw(token.address, amount, other.address, data)

                const currentWalletBalance = await token.balanceOf(wallet.address)
                expect(currentWalletBalance).to.be.equal(previousWalletBalance.sub(amount))

                const currentRecipientBalance = await token.balanceOf(other.address)
                expect(currentRecipientBalance).to.be.equal(previousRecipientBalance.add(amountAfterFees))

                const currentFeeCollectorBalance = await token.balanceOf(feeCollector.address)
                expect(currentFeeCollectorBalance).to.be.equal(previousFeeCollectorBalance.add(expectedChargedFees))
              })

              it('emits an event', async () => {
                const tx = await wallet.withdraw(token.address, amount, other.address, data)

                await assertEvent(tx, 'Withdraw', {
                  token,
                  amount: amountAfterFees,
                  recipient: other,
                  fee: expectedChargedFees,
                  data,
                })
              })
            }

            context('without cap', async () => {
              beforeEach('set withdraw fee', async () => {
                await wallet.connect(admin).setWithdrawFee(withdrawFee, 0, ZERO_ADDRESS, 0)
              })

              itWithdrawsCorrectly(withdrawFeeAmount)

              it('does not update the total charged fees', async () => {
                const previousData = await wallet.withdrawFee()

                await wallet.withdraw(token.address, amount, other.address, data)

                const currentData = await wallet.withdrawFee()
                expect(currentData.pct).to.be.equal(previousData.pct)
                expect(currentData.cap).to.be.equal(previousData.cap)
                expect(currentData.period).to.be.equal(previousData.period)
                expect(currentData.totalCharged).to.be.equal(0)
                expect(currentData.nextResetTime).to.be.equal(0)
              })
            })

            context('with cap', async () => {
              const period = MONTH
              const capTokenRate = 2
              const cap = withdrawFeeAmount.mul(capTokenRate)

              let capToken: Contract
              let periodStartTime: BigNumber

              beforeEach('deploy cap token', async () => {
                capToken = await deploy('TokenMock', ['USDT'])
                await priceOracle.mockRate(token.address, capToken.address, fp(capTokenRate))
              })

              beforeEach('set withdraw fee', async () => {
                await wallet.connect(admin).setWithdrawFee(withdrawFee, cap, capToken.address, period)
                periodStartTime = await currentTimestamp()
              })

              context('when the cap period has not been reached', async () => {
                itWithdrawsCorrectly(withdrawFeeAmount)

                it('updates the total charged fees', async () => {
                  const previousData = await wallet.withdrawFee()

                  await wallet.withdraw(token.address, amount, other.address, data)

                  const currentData = await wallet.withdrawFee()
                  expect(currentData.pct).to.be.equal(previousData.pct)
                  expect(currentData.cap).to.be.equal(previousData.cap)
                  expect(currentData.token).to.be.equal(previousData.token)
                  expect(currentData.period).to.be.equal(previousData.period)
                  expect(currentData.totalCharged).to.be.equal(withdrawFeeAmount.mul(capTokenRate))
                  expect(currentData.nextResetTime).to.be.equal(periodStartTime.add(period))
                })
              })

              context('when the cap period has been reached', async () => {
                beforeEach('accrue some charged fees', async () => {
                  await token.mint(wallet.address, amount.mul(3).div(4))
                  await wallet.withdraw(token.address, amount.mul(3).div(4), other.address, data)
                })

                context('within the current cap period', async () => {
                  const expectedChargedFees = withdrawFeeAmount.div(4) // already accrued 3/4 of it

                  itWithdrawsCorrectly(expectedChargedFees)

                  it('updates the total charged fees', async () => {
                    const previousData = await wallet.withdrawFee()

                    await wallet.withdraw(token.address, amount, other.address, data)

                    const currentData = await wallet.withdrawFee()
                    expect(currentData.pct).to.be.equal(previousData.pct)
                    expect(currentData.cap).to.be.equal(previousData.cap)
                    expect(currentData.token).to.be.equal(previousData.token)
                    expect(currentData.period).to.be.equal(previousData.period)
                    expect(currentData.totalCharged).to.be.equal(cap)
                    expect(currentData.nextResetTime).to.be.equal(periodStartTime.add(period))
                  })
                })

                context('within the next cap period', async () => {
                  beforeEach('advance time', async () => {
                    await advanceTime(period + 1)
                  })

                  itWithdrawsCorrectly(withdrawFeeAmount)

                  it('updates the total charged fees and the next reset time', async () => {
                    const previousData = await wallet.withdrawFee()

                    await wallet.withdraw(token.address, amount, other.address, data)

                    const currentData = await wallet.withdrawFee()
                    expect(currentData.pct).to.be.equal(previousData.pct)
                    expect(currentData.cap).to.be.equal(previousData.cap)
                    expect(currentData.token).to.be.equal(previousData.token)
                    expect(currentData.period).to.be.equal(previousData.period)
                    expect(currentData.totalCharged).to.be.equal(withdrawFeeAmount.mul(capTokenRate))
                    expect(currentData.nextResetTime).to.be.equal(periodStartTime.add(period).add(period))
                  })
                })
              })
            })
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

      context('when withdrawing native tokens', () => {
        let token: string

        beforeEach('set token address', async () => {
          token = NATIVE_TOKEN_ADDRESS
        })

        context('when the wallet has enough balance', async () => {
          beforeEach('deposit native tokens', async () => {
            await admin.sendTransaction({ to: wallet.address, value: amount })
          })

          context('without withdraw fees', async () => {
            it('transfers the tokens to the recipient', async () => {
              const previousWalletBalance = await ethers.provider.getBalance(wallet.address)
              const previousRecipientBalance = await ethers.provider.getBalance(other.address)

              await wallet.withdraw(token, amount, other.address, data)

              const currentWalletBalance = await ethers.provider.getBalance(wallet.address)
              expect(currentWalletBalance).to.be.equal(previousWalletBalance.sub(amount))

              const currentRecipientBalance = await ethers.provider.getBalance(other.address)
              expect(currentRecipientBalance).to.be.equal(previousRecipientBalance.add(amount))
            })

            it('emits an event', async () => {
              const tx = await wallet.withdraw(token, amount, other.address, data)

              await assertEvent(tx, 'Withdraw', { token, amount, recipient: other, fee: 0, data })
            })
          })

          context('with withdraw fees', async () => {
            const withdrawFee = fp(0.01)
            const withdrawFeeAmount = amount.mul(withdrawFee).div(fp(1))

            beforeEach('authorize', async () => {
              const setWithdrawFeeRole = wallet.interface.getSighash('setWithdrawFee')
              await wallet.connect(admin).authorize(admin.address, setWithdrawFeeRole)
            })

            const itWithdrawsCorrectly = (expectedChargedFees: BigNumber) => {
              const amountAfterFees = amount.sub(expectedChargedFees)

              it('transfers the tokens to the recipient', async () => {
                const previousWalletBalance = await ethers.provider.getBalance(wallet.address)
                const previousRecipientBalance = await ethers.provider.getBalance(other.address)
                const previousFeeCollectorBalance = await ethers.provider.getBalance(feeCollector.address)

                await wallet.withdraw(token, amount, other.address, data)

                const currentWalletBalance = await ethers.provider.getBalance(wallet.address)
                expect(currentWalletBalance).to.be.equal(previousWalletBalance.sub(amount))

                const currentRecipientBalance = await ethers.provider.getBalance(other.address)
                expect(currentRecipientBalance).to.be.equal(previousRecipientBalance.add(amountAfterFees))

                const currentFeeCollectorBalance = await ethers.provider.getBalance(feeCollector.address)
                expect(currentFeeCollectorBalance).to.be.equal(previousFeeCollectorBalance.add(expectedChargedFees))
              })

              it('emits an event', async () => {
                const tx = await wallet.withdraw(token, amount, other.address, data)

                await assertEvent(tx, 'Withdraw', {
                  token,
                  amount: amountAfterFees,
                  recipient: other,
                  fee: expectedChargedFees,
                  data,
                })
              })
            }

            context('without cap', async () => {
              beforeEach('set withdraw fee', async () => {
                await wallet.connect(admin).setWithdrawFee(withdrawFee, 0, ZERO_ADDRESS, 0)
              })

              itWithdrawsCorrectly(withdrawFeeAmount)

              it('does not update the total charged fees', async () => {
                const previousData = await wallet.withdrawFee()

                await wallet.withdraw(token, amount, other.address, data)

                const currentData = await wallet.withdrawFee()
                expect(currentData.pct).to.be.equal(previousData.pct)
                expect(currentData.cap).to.be.equal(previousData.cap)
                expect(currentData.period).to.be.equal(previousData.period)
                expect(currentData.totalCharged).to.be.equal(0)
                expect(currentData.nextResetTime).to.be.equal(0)
              })
            })

            context('with cap', async () => {
              const period = MONTH
              const capTokenRate = 2
              const cap = withdrawFeeAmount.mul(capTokenRate)

              let capToken: Contract
              let periodStartTime: BigNumber

              beforeEach('deploy cap token', async () => {
                capToken = await deploy('TokenMock', ['USDT'])
                await priceOracle.mockRate(token, capToken.address, fp(capTokenRate))
              })

              beforeEach('set withdraw fee', async () => {
                await wallet.connect(admin).setWithdrawFee(withdrawFee, cap, capToken.address, period)
                periodStartTime = await currentTimestamp()
              })

              context('when the cap period has not been reached', async () => {
                itWithdrawsCorrectly(withdrawFeeAmount)

                it('updates the total charged fees', async () => {
                  const previousData = await wallet.withdrawFee()

                  await wallet.withdraw(token, amount, other.address, data)

                  const currentData = await wallet.withdrawFee()
                  expect(currentData.pct).to.be.equal(previousData.pct)
                  expect(currentData.cap).to.be.equal(previousData.cap)
                  expect(currentData.token).to.be.equal(previousData.token)
                  expect(currentData.period).to.be.equal(previousData.period)
                  expect(currentData.totalCharged).to.be.equal(withdrawFeeAmount.mul(capTokenRate))
                  expect(currentData.nextResetTime).to.be.equal(periodStartTime.add(period))
                })
              })

              context('when the cap period has been reached', async () => {
                beforeEach('accrue some charged fees', async () => {
                  await admin.sendTransaction({ to: wallet.address, value: amount.mul(3).div(4) })
                  await wallet.withdraw(token, amount.mul(3).div(4), other.address, data)
                })

                context('within the current cap period', async () => {
                  const expectedChargedFees = withdrawFeeAmount.div(4) // already accrued 3/4 of it

                  itWithdrawsCorrectly(expectedChargedFees)

                  it('updates the total charged fees', async () => {
                    const previousData = await wallet.withdrawFee()

                    await wallet.withdraw(token, amount, other.address, data)

                    const currentData = await wallet.withdrawFee()
                    expect(currentData.pct).to.be.equal(previousData.pct)
                    expect(currentData.cap).to.be.equal(previousData.cap)
                    expect(currentData.token).to.be.equal(previousData.token)
                    expect(currentData.period).to.be.equal(previousData.period)
                    expect(currentData.totalCharged).to.be.equal(cap)
                    expect(currentData.nextResetTime).to.be.equal(periodStartTime.add(period))
                  })
                })

                context('within the next cap period', async () => {
                  beforeEach('advance time', async () => {
                    await advanceTime(period + 1)
                  })

                  itWithdrawsCorrectly(withdrawFeeAmount)

                  it('updates the total charged fees and the next reset time', async () => {
                    const previousData = await wallet.withdrawFee()

                    await wallet.withdraw(token, amount, other.address, data)

                    const currentData = await wallet.withdrawFee()
                    expect(currentData.pct).to.be.equal(previousData.pct)
                    expect(currentData.cap).to.be.equal(previousData.cap)
                    expect(currentData.token).to.be.equal(previousData.token)
                    expect(currentData.period).to.be.equal(previousData.period)
                    expect(currentData.totalCharged).to.be.equal(withdrawFeeAmount.mul(capTokenRate))
                    expect(currentData.nextResetTime).to.be.equal(periodStartTime.add(period).add(period))
                  })
                })
              })
            })
          })
        })

        context('when the wallet does not have enough balance', async () => {
          it('reverts', async () => {
            await expect(wallet.withdraw(token, amount, other.address, data)).to.be.revertedWith(
              'Address: insufficient balance'
            )
          })
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.withdraw(ZERO_ADDRESS, 0, other.address, '0x')).to.be.revertedWith(
          'AUTH_SENDER_NOT_ALLOWED'
        )
      })
    })
  })

  describe('wrap', () => {
    const amount = fp(1)
    const data = '0xabcdef'

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const wrapRole = wallet.interface.getSighash('wrap')
        await wallet.connect(admin).authorize(admin.address, wrapRole)
        wallet = wallet.connect(admin)
      })

      context('when the wallet has enough wrapped native tokens', () => {
        beforeEach('fund wallet', async () => {
          await admin.sendTransaction({ to: wallet.address, value: amount.mul(2) })
        })

        it('wraps the requested amount', async () => {
          const previousNativeBalance = await ethers.provider.getBalance(wallet.address)
          const previousWrappedBalance = await wrappedNativeToken.balanceOf(wallet.address)

          await wallet.wrap(amount, data)

          const currentNativeBalance = await ethers.provider.getBalance(wallet.address)
          expect(currentNativeBalance).to.be.equal(previousNativeBalance.sub(amount))

          const currentWrappedBalance = await wrappedNativeToken.balanceOf(wallet.address)
          expect(currentWrappedBalance).to.be.equal(previousWrappedBalance.add(amount))
        })

        it('emits an event', async () => {
          const tx = await wallet.wrap(amount, data)
          await assertEvent(tx, 'Wrap', { amount, data })
        })
      })

      context('when the wallet does not have enough native tokens', () => {
        it('reverts', async () => {
          await expect(wallet.wrap(amount, data)).to.be.revertedWith('WRAP_INSUFFICIENT_AMOUNT')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.wrap(amount, data)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('unwrap', () => {
    const amount = fp(1)
    const data = '0xabcdef'

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const unwrapRole = wallet.interface.getSighash('unwrap')
        await wallet.connect(admin).authorize(admin.address, unwrapRole)
        wallet = wallet.connect(admin)
      })

      context('when the wallet has enough wrapped native tokens', () => {
        beforeEach('wrap tokens', async () => {
          await admin.sendTransaction({ to: wallet.address, value: amount.mul(2) })
          const wrapRole = wallet.interface.getSighash('wrap')
          await wallet.connect(admin).authorize(admin.address, wrapRole)
          await wallet.wrap(amount.mul(2), data)
        })

        it('unwraps the requested amount', async () => {
          const previousNativeBalance = await ethers.provider.getBalance(wallet.address)
          const previousWrappedBalance = await wrappedNativeToken.balanceOf(wallet.address)

          await wallet.unwrap(amount, data)

          const currentNativeBalance = await ethers.provider.getBalance(wallet.address)
          expect(currentNativeBalance).to.be.equal(previousNativeBalance.add(amount))

          const currentWrappedBalance = await wrappedNativeToken.balanceOf(wallet.address)
          expect(currentWrappedBalance).to.be.equal(previousWrappedBalance.sub(amount))
        })

        it('emits an event', async () => {
          const tx = await wallet.unwrap(amount, data)
          await assertEvent(tx, 'Unwrap', { amount })
        })
      })

      context('when the wallet does not have enough wrapped native tokens', () => {
        it('reverts', async () => {
          await expect(wallet.unwrap(amount, data)).to.be.revertedWith('WNT_NOT_ENOUGH_BALANCE')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.unwrap(amount, data)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('claim', () => {
    // TODO: implement
  })

  describe('join', () => {
    let token: Contract

    const data = '0xabcdef'

    beforeEach('set token', async () => {
      token = await instanceAt('TokenMock', await strategy.token())
    })

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const joinRole = wallet.interface.getSighash('join')
        await wallet.connect(admin).authorize(admin.address, joinRole)
        wallet = wallet.connect(admin)
      })

      context('when the amount is greater than zero', () => {
        const amount = fp(200)

        context('when the slippage is valid', async () => {
          const slippage = fp(0.01)

          context('when the wallet has enough balance', async () => {
            beforeEach('mint tokens', async () => {
              await token.mint(wallet.address, amount)
            })

            it('transfers the tokens to the recipient', async () => {
              const previousWalletBalance = await token.balanceOf(wallet.address)
              const previousStrategyBalance = await token.balanceOf(strategy.address)

              await wallet.join(amount, slippage, data)

              const currentWalletBalance = await token.balanceOf(wallet.address)
              expect(currentWalletBalance).to.be.equal(previousWalletBalance.sub(amount))

              const currentStrategyBalance = await token.balanceOf(strategy.address)
              expect(currentStrategyBalance).to.be.equal(previousStrategyBalance.add(amount))
            })

            it('emits an event', async () => {
              const tx = await wallet.join(amount, slippage, data)

              await assertEvent(tx, 'Join', { amount, slippage, data })
            })
          })

          context('when the wallet does not have enough tokens', async () => {
            it('reverts', async () => {
              await expect(wallet.join(amount, slippage, data)).to.be.revertedWith(
                'ERC20: transfer amount exceeds balance'
              )
            })
          })
        })

        context('when the slippage is invalid', async () => {
          const slippage = fp(1.01)

          it('reverts', async () => {
            await expect(wallet.join(amount, slippage, data)).to.be.revertedWith('JOIN_SLIPPAGE_ABOVE_ONE')
          })
        })
      })

      context('when the amount is zero', async () => {
        const amount = 0

        it('reverts', async () => {
          await expect(wallet.join(amount, 0, data)).to.be.revertedWith('JOIN_AMOUNT_ZERO')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.join(0, 0, data)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('exit', () => {
    let token: Contract

    const data = '0xabcdef'

    beforeEach('set token', async () => {
      token = await instanceAt('TokenMock', await strategy.token())
    })

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const exitRole = wallet.interface.getSighash('exit')
        await wallet.connect(admin).authorize(admin.address, exitRole)
        wallet = wallet.connect(admin)
      })

      context('when the wallet has joined before', async () => {
        const joinAmount = fp(150)

        beforeEach('join strategy', async () => {
          const joinRole = wallet.interface.getSighash('join')
          await wallet.connect(admin).authorize(admin.address, joinRole)
          await token.mint(wallet.address, joinAmount)
          await wallet.join(joinAmount, 0, data)
        })

        context('when the slippage is valid', async () => {
          const slippage = fp(0.01)

          context('when the given ratio is valid', async () => {
            async function computeExitAmount(ratio: BigNumber): Promise<BigNumber> {
              const currentValue = await strategy.callStatic.currentValue()
              const exitValue = currentValue.mul(ratio).div(fp(1))
              const valueRate = await strategy.valueRate()
              return exitValue.mul(valueRate).div(fp(1))
            }

            async function computeInvestedValueAfterExit(ratio: BigNumber): Promise<BigNumber> {
              const investedValue = await wallet.investedValue()
              const currentValue = await strategy.callStatic.currentValue()
              const valueGains = currentValue.gt(investedValue) ? currentValue.sub(investedValue) : bn(0)

              // If there are no gains, the invested value is reduced by the exit ratio
              if (valueGains.eq(0)) return investedValue.mul(fp(1).sub(ratio)).div(fp(1))

              // If there are gains but the exit value is less than that, the invested value is still the same.
              // Otherwise, it should be reduced only by the portion of exit value that doesn't represent gains.
              const exitValue = currentValue.mul(ratio).div(fp(1))
              const decrement = exitValue.lte(valueGains) ? bn(0) : exitValue.sub(valueGains)
              return investedValue.sub(decrement)
            }

            const itDoesNotAffectTheInvestedValue = (ratio: BigNumber) => {
              it('does not affect the invested value', async () => {
                const previousInvestedValue = await wallet.investedValue()

                await wallet.exit(ratio, slippage, data)

                const currentInvestedValue = await wallet.investedValue()
                expect(currentInvestedValue).to.be.equal(previousInvestedValue)
              })
            }

            const itDecreasesTheInvestedValue = (ratio: BigNumber) => {
              it('decreases the invested value', async () => {
                const expectedInvestedValue = await computeInvestedValueAfterExit(ratio)

                await wallet.exit(ratio, slippage, data)

                const currentInvestmentValue = await wallet.investedValue()
                expect(currentInvestmentValue).to.be.equal(expectedInvestedValue)
              })
            }

            const itDoesNotPayPerformanceFees = (ratio: BigNumber) => {
              it('does not pay performance fees', async () => {
                const previousBalance = await token.balanceOf(feeCollector.address)

                await wallet.exit(ratio, slippage, data)

                const currentBalance = await token.balanceOf(feeCollector.address)
                expect(currentBalance).to.be.equal(previousBalance)
              })
            }

            context('with performance fee', async () => {
              const performanceFee = fp(0.02)

              beforeEach('set performance fee', async () => {
                const setPerformanceFeeRole = wallet.interface.getSighash('setPerformanceFee')
                await wallet.connect(admin).authorize(admin.address, setPerformanceFeeRole)
                await wallet.connect(admin).setPerformanceFee(performanceFee, fp(1000), token.address, MONTH)
              })

              async function computePerformanceFeeAmount(ratio: BigNumber): Promise<BigNumber> {
                const investedValue = await wallet.investedValue()
                const currentValue = await strategy.callStatic.currentValue()
                const valueGains = currentValue.gt(investedValue) ? currentValue.sub(investedValue) : bn(0)
                if (valueGains.eq(0)) return bn(0)

                const exitValue = currentValue.mul(ratio).div(fp(1))
                const taxableValue = exitValue.gt(valueGains) ? valueGains : exitValue

                const valueRate = await strategy.valueRate()
                const taxableAmount = taxableValue.mul(valueRate).div(fp(1))
                return taxableAmount.mul(performanceFee).div(fp(1))
              }

              const itTransfersTheTokensToTheWallet = (ratio: BigNumber) => {
                it('transfers the tokens to the vault', async () => {
                  const previousWalletBalance = await token.balanceOf(wallet.address)
                  const previousStrategyBalance = await token.balanceOf(strategy.address)
                  const exitAmount = await computeExitAmount(ratio)
                  const performanceFeeAmount = await computePerformanceFeeAmount(ratio)
                  const expectedAmountAfterFees = exitAmount.sub(performanceFeeAmount)

                  await wallet.exit(ratio, slippage, data)

                  const currentWalletBalance = await token.balanceOf(wallet.address)
                  const expectedWalletBalance = previousWalletBalance.add(expectedAmountAfterFees)
                  expect(currentWalletBalance).to.be.at.least(expectedWalletBalance.sub(1))
                  expect(currentWalletBalance).to.be.at.most(expectedWalletBalance.add(1))

                  const currentStrategyBalance = await token.balanceOf(strategy.address)
                  expect(currentStrategyBalance).to.be.equal(previousStrategyBalance.sub(exitAmount))
                })

                it('emits an event', async () => {
                  const exitAmount = await computeExitAmount(ratio)
                  const performanceFeeAmount = await computePerformanceFeeAmount(ratio)
                  const expectedAmountAfterFees = exitAmount.sub(performanceFeeAmount)

                  const tx = await wallet.exit(ratio, slippage, data)

                  await assertEvent(tx, 'Exit', {
                    amount: expectedAmountAfterFees,
                    value: exitAmount, // rate 1
                    fee: performanceFeeAmount,
                  })
                })
              }

              const itPaysPerformanceFees = (ratio: BigNumber) => {
                it('pays performance fees to the fee collector', async () => {
                  const previousBalance = await token.balanceOf(feeCollector.address)
                  const expectedPerformanceFeeAmount = await computePerformanceFeeAmount(ratio)

                  await wallet.exit(ratio, slippage, data)

                  const currentBalance = await token.balanceOf(feeCollector.address)
                  const expectedBalance = previousBalance.add(expectedPerformanceFeeAmount)
                  expect(currentBalance).to.be.at.least(expectedBalance.sub(1))
                  expect(currentBalance).to.be.at.most(expectedBalance.add(1))
                })

                it('updates the total charged fees', async () => {
                  const previousData = await wallet.performanceFee()
                  const expectedPerformanceFeeAmount = await computePerformanceFeeAmount(ratio)

                  await wallet.exit(ratio, slippage, data)

                  const currentData = await wallet.performanceFee()
                  expect(currentData.pct).to.be.equal(previousData.pct)
                  expect(currentData.cap).to.be.equal(previousData.cap)
                  expect(currentData.token).to.be.equal(previousData.token)
                  expect(currentData.period).to.be.equal(previousData.period)
                  expect(currentData.totalCharged).to.be.equal(expectedPerformanceFeeAmount)
                  expect(currentData.nextResetTime).to.be.equal(previousData.nextResetTime)
                })
              }

              context('when the strategy is even', async () => {
                context('when withdraws half', async () => {
                  const ratio = fp(0.5)

                  itTransfersTheTokensToTheWallet(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })

                context('when withdraws all', async () => {
                  const ratio = fp(1)

                  itTransfersTheTokensToTheWallet(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })
              })

              context('when the strategy reports some gains (2x)', async () => {
                beforeEach('mock gains', async () => {
                  await strategy.mockGains(2)
                })

                context('when withdraws only gains', async () => {
                  const ratio = fp(0.5)

                  itTransfersTheTokensToTheWallet(ratio)
                  itDoesNotAffectTheInvestedValue(ratio)
                  itPaysPerformanceFees(ratio)
                })

                context('when withdraws more than gains', async () => {
                  const ratio = fp(0.75)

                  itTransfersTheTokensToTheWallet(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itPaysPerformanceFees(ratio)
                })

                context('when withdraws all', async () => {
                  const ratio = fp(1)

                  itTransfersTheTokensToTheWallet(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itPaysPerformanceFees(ratio)
                })
              })

              context('when the strategy reports losses (0.5x)', async () => {
                beforeEach('mock losses', async () => {
                  await strategy.mockLosses(2)
                })

                context('when withdraws half', async () => {
                  const ratio = fp(0.5)

                  itTransfersTheTokensToTheWallet(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })

                context('when withdraws all', async () => {
                  const ratio = fp(1)

                  itTransfersTheTokensToTheWallet(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })
              })
            })

            context('without performance fee', async () => {
              const itTransfersTheTokensToTheWallet = (ratio: BigNumber) => {
                it('transfers the tokens to the vault', async () => {
                  const exitAmount = await computeExitAmount(ratio)
                  const previousWalletBalance = await token.balanceOf(wallet.address)
                  const previousStrategyBalance = await token.balanceOf(strategy.address)

                  await wallet.exit(ratio, slippage, data)

                  const currentWalletBalance = await token.balanceOf(wallet.address)
                  const expectedWalletBalance = previousWalletBalance.add(exitAmount)
                  expect(currentWalletBalance).to.be.at.least(expectedWalletBalance.sub(1))
                  expect(currentWalletBalance).to.be.at.most(expectedWalletBalance.add(1))

                  const currentStrategyBalance = await token.balanceOf(strategy.address)
                  expect(currentStrategyBalance).to.be.equal(previousStrategyBalance.sub(exitAmount))
                })

                it('emits an event', async () => {
                  const exitAmount = await computeExitAmount(ratio)

                  const tx = await wallet.exit(ratio, slippage, data)

                  await assertEvent(tx, 'Exit', {
                    amount: exitAmount,
                    value: exitAmount, // rate 1
                    fee: 0,
                  })
                })
              }

              context('when the strategy is even', async () => {
                context('when withdraws half', async () => {
                  const ratio = fp(0.5)

                  itTransfersTheTokensToTheWallet(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })

                context('when withdraws all', async () => {
                  const ratio = fp(1)

                  itTransfersTheTokensToTheWallet(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })
              })

              context('when the strategy reports some gains (2x)', async () => {
                beforeEach('mock gains', async () => {
                  await strategy.mockGains(2)
                })

                context('when withdraws only gains', async () => {
                  const ratio = fp(0.5)

                  itTransfersTheTokensToTheWallet(ratio)
                  itDoesNotAffectTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })

                context('when withdraws more than gains', async () => {
                  const ratio = fp(0.75)

                  itTransfersTheTokensToTheWallet(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })

                context('when withdraws all', async () => {
                  const ratio = fp(1)

                  itTransfersTheTokensToTheWallet(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })
              })

              context('when the strategy reports losses (0.5x)', async () => {
                beforeEach('mock losses', async () => {
                  await strategy.mockLosses(2)
                })

                context('when withdraws half', async () => {
                  const ratio = fp(0.5)

                  itTransfersTheTokensToTheWallet(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })

                context('when withdraws all', async () => {
                  const ratio = fp(1)

                  itTransfersTheTokensToTheWallet(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })
              })
            })
          })

          context('when the given ratio is not valid', async () => {
            const ratio = fp(10)

            it('reverts', async () => {
              await expect(wallet.exit(ratio, slippage, data)).to.be.revertedWith('EXIT_INVALID_RATIO')
            })
          })
        })

        context('when the slippage is invalid', async () => {
          const slippage = fp(1.01)

          it('reverts', async () => {
            await expect(wallet.exit(fp(1), slippage, data)).to.be.revertedWith('EXIT_SLIPPAGE_ABOVE_ONE')
          })
        })
      })

      context('when the wallet has not joined before', async () => {
        it('reverts', async () => {
          await expect(wallet.exit(0, 0, data)).to.be.revertedWith('EXIT_NO_INVESTED_VALUE')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.exit(0, 0, data)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('swap', () => {
    let tokenIn: Contract, tokenOut: Contract

    const source = 0
    const amount = fp(500)
    const data = '0xabcdef'

    const SWAP_LIMIT = { SLIPPAGE: 0, MIN_AMOUNT_OUT: 1 }

    before('deploy tokens', async () => {
      tokenIn = await deploy('TokenMock', ['USDC'])
      tokenOut = await deploy('TokenMock', ['USDT'])
    })

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const swapRole = wallet.interface.getSighash('swap')
        await wallet.connect(admin).authorize(admin.address, swapRole)
        wallet = wallet.connect(admin)
      })

      const itSwapsAsExpected = (
        limitType: number,
        limitAmount: BigNumberish,
        expectedAmountOut: BigNumber,
        expectedMinAmountOut: BigNumber
      ) => {
        beforeEach('fund swap connector', async () => {
          await tokenOut.mint(swapConnector.address, expectedAmountOut)
        })

        context('without swap fee', () => {
          it('transfers the token in to the swap connector', async () => {
            const previousWalletBalance = await tokenIn.balanceOf(wallet.address)
            const previousConnectorBalance = await tokenIn.balanceOf(swapConnector.address)

            await wallet.swap(source, tokenIn.address, tokenOut.address, amount, limitType, limitAmount, data)

            const currentWalletBalance = await tokenIn.balanceOf(wallet.address)
            expect(currentWalletBalance).to.be.equal(previousWalletBalance.sub(amount))

            const currentConnectorBalance = await tokenIn.balanceOf(swapConnector.address)
            expect(currentConnectorBalance).to.be.equal(previousConnectorBalance.add(amount))
          })

          it('transfers the token out to the wallet', async () => {
            const previousWalletBalance = await tokenOut.balanceOf(wallet.address)
            const previousConnectorBalance = await tokenOut.balanceOf(swapConnector.address)

            await wallet.swap(source, tokenIn.address, tokenOut.address, amount, limitType, limitAmount, data)

            const currentWalletBalance = await tokenOut.balanceOf(wallet.address)
            expect(currentWalletBalance).to.be.equal(previousWalletBalance.add(expectedAmountOut))

            const currentConnectorBalance = await tokenOut.balanceOf(swapConnector.address)
            expect(currentConnectorBalance).to.be.equal(previousConnectorBalance.sub(expectedAmountOut))
          })

          it('emits an event', async () => {
            const tx = await wallet.swap(
              source,
              tokenIn.address,
              tokenOut.address,
              amount,
              limitType,
              limitAmount,
              data
            )

            await assertEvent(tx, 'Swap', {
              source,
              tokenIn,
              tokenOut,
              amountIn: amount,
              amountOut: expectedAmountOut,
              minAmountOut: expectedMinAmountOut,
              fee: 0,
              data,
            })
          })
        })

        context('with swap fee', () => {
          const swapFee = fp(0.03)
          const swapFeeAmount = expectedAmountOut.mul(swapFee).div(fp(1))

          beforeEach('authorize', async () => {
            const setSwapFeeRole = wallet.interface.getSighash('setSwapFee')
            await wallet.connect(admin).authorize(admin.address, setSwapFeeRole)
          })

          const itSwapsCorrectly = (expectedChargedFees: BigNumber) => {
            const expectedAmountOutAfterFees = expectedAmountOut.sub(expectedChargedFees)

            it('transfers the token in to the swap connector', async () => {
              const previousWalletBalance = await tokenIn.balanceOf(wallet.address)
              const previousConnectorBalance = await tokenIn.balanceOf(swapConnector.address)
              const previousFeeCollectorBalance = await tokenIn.balanceOf(feeCollector.address)

              await wallet.swap(source, tokenIn.address, tokenOut.address, amount, limitType, limitAmount, data)

              const currentWalletBalance = await tokenIn.balanceOf(wallet.address)
              expect(currentWalletBalance).to.be.equal(previousWalletBalance.sub(amount))

              const currentConnectorBalance = await tokenIn.balanceOf(swapConnector.address)
              expect(currentConnectorBalance).to.be.equal(previousConnectorBalance.add(amount))

              const currentFeeCollectorBalance = await tokenIn.balanceOf(feeCollector.address)
              expect(currentFeeCollectorBalance).to.be.equal(previousFeeCollectorBalance)
            })

            it('transfers the token out to the wallet', async () => {
              const previousWalletBalance = await tokenOut.balanceOf(wallet.address)
              const previousConnectorBalance = await tokenOut.balanceOf(swapConnector.address)
              const previousFeeCollectorBalance = await tokenOut.balanceOf(feeCollector.address)

              await wallet.swap(source, tokenIn.address, tokenOut.address, amount, limitType, limitAmount, data)

              const currentWalletBalance = await tokenOut.balanceOf(wallet.address)
              expect(currentWalletBalance).to.be.equal(previousWalletBalance.add(expectedAmountOutAfterFees))

              const currentConnectorBalance = await tokenOut.balanceOf(swapConnector.address)
              expect(currentConnectorBalance).to.be.equal(previousConnectorBalance.sub(expectedAmountOut))

              const currentFeeCollectorBalance = await tokenOut.balanceOf(feeCollector.address)
              expect(currentFeeCollectorBalance).to.be.equal(previousFeeCollectorBalance.add(expectedChargedFees))
            })

            it('emits an event', async () => {
              const tx = await wallet.swap(
                source,
                tokenIn.address,
                tokenOut.address,
                amount,
                limitType,
                limitAmount,
                data
              )

              await assertEvent(tx, 'Swap', {
                source,
                tokenIn,
                tokenOut,
                amountIn: amount,
                amountOut: expectedAmountOutAfterFees,
                minAmountOut: expectedMinAmountOut,
                fee: expectedChargedFees,
                data,
              })
            })
          }

          context('without cap', async () => {
            beforeEach('set swap fee', async () => {
              await wallet.connect(admin).setSwapFee(swapFee, 0, ZERO_ADDRESS, 0)
            })

            itSwapsCorrectly(swapFeeAmount)

            it('does not update the total charged fees', async () => {
              const previousData = await wallet.swapFee()

              await wallet.swap(source, tokenIn.address, tokenOut.address, amount, limitType, limitAmount, data)

              const currentData = await wallet.swapFee()
              expect(currentData.pct).to.be.equal(previousData.pct)
              expect(currentData.cap).to.be.equal(previousData.cap)
              expect(currentData.period).to.be.equal(previousData.period)
              expect(currentData.totalCharged).to.be.equal(0)
              expect(currentData.nextResetTime).to.be.equal(0)
            })
          })

          context('with cap', async () => {
            const period = MONTH
            const capTokenRate = 2
            const cap = swapFeeAmount.mul(capTokenRate)

            let capToken: Contract
            let periodStartTime: BigNumber

            beforeEach('deploy cap token', async () => {
              capToken = await deploy('TokenMock', ['USDT'])
              await priceOracle.mockRate(tokenOut.address, capToken.address, fp(capTokenRate))
            })

            beforeEach('set swap fee', async () => {
              await wallet.connect(admin).setSwapFee(swapFee, cap, capToken.address, period)
              periodStartTime = await currentTimestamp()
            })

            context('when the cap period has not been reached', async () => {
              itSwapsCorrectly(swapFeeAmount)

              it('updates the total charged fees', async () => {
                const previousData = await wallet.swapFee()

                await wallet.swap(source, tokenIn.address, tokenOut.address, amount, limitType, limitAmount, data)

                const currentData = await wallet.swapFee()
                expect(currentData.pct).to.be.equal(previousData.pct)
                expect(currentData.cap).to.be.equal(previousData.cap)
                expect(currentData.token).to.be.equal(previousData.token)
                expect(currentData.period).to.be.equal(previousData.period)
                expect(currentData.totalCharged).to.be.equal(swapFeeAmount.mul(capTokenRate))
                expect(currentData.nextResetTime).to.be.equal(periodStartTime.add(period))
              })
            })

            context('when the cap period has been reached', async () => {
              beforeEach('accrue some charged fees', async () => {
                await tokenIn.mint(wallet.address, amount.mul(3).div(4))
                await tokenOut.mint(swapConnector.address, expectedAmountOut.mul(3).div(4))

                const limit = limitType == SWAP_LIMIT.SLIPPAGE ? limitAmount : bn(limitAmount).mul(3).div(4)
                await wallet.swap(
                  source,
                  tokenIn.address,
                  tokenOut.address,
                  amount.mul(3).div(4),
                  limitType,
                  limit,
                  data
                )
              })

              context('within the current cap period', async () => {
                const expectedChargedFees = swapFeeAmount.div(4) // already accrued 3/4 of it

                itSwapsCorrectly(expectedChargedFees)

                it('updates the total charged fees', async () => {
                  const previousData = await wallet.swapFee()

                  await wallet.swap(source, tokenIn.address, tokenOut.address, amount, limitType, limitAmount, data)

                  const currentData = await wallet.swapFee()
                  expect(currentData.pct).to.be.equal(previousData.pct)
                  expect(currentData.cap).to.be.equal(previousData.cap)
                  expect(currentData.token).to.be.equal(previousData.token)
                  expect(currentData.period).to.be.equal(previousData.period)
                  expect(currentData.totalCharged).to.be.equal(cap)
                  expect(currentData.nextResetTime).to.be.equal(periodStartTime.add(period))
                })
              })

              context('within the next cap period', async () => {
                beforeEach('advance time', async () => {
                  await advanceTime(period + 1)
                })

                itSwapsCorrectly(swapFeeAmount)

                it('updates the total charged fees and the next reset time', async () => {
                  const previousData = await wallet.swapFee()

                  await wallet.swap(source, tokenIn.address, tokenOut.address, amount, limitType, limitAmount, data)

                  const currentData = await wallet.swapFee()
                  expect(currentData.pct).to.be.equal(previousData.pct)
                  expect(currentData.cap).to.be.equal(previousData.cap)
                  expect(currentData.token).to.be.equal(previousData.token)
                  expect(currentData.period).to.be.equal(previousData.period)
                  expect(currentData.totalCharged).to.be.equal(swapFeeAmount.mul(capTokenRate))
                  expect(currentData.nextResetTime).to.be.equal(periodStartTime.add(period).add(period))
                })
              })
            })
          })
        })
      }

      context('when using a slippage limit', () => {
        const limitType = SWAP_LIMIT.SLIPPAGE

        context('when the given slippage is valid', () => {
          const ORACLE_RATE = fp(0.98)
          const oracleAmountOut = amount.mul(ORACLE_RATE).div(fp(1))

          beforeEach('mock price oracle rate', async () => {
            await priceOracle.mockRate(tokenIn.address, tokenOut.address, ORACLE_RATE)
          })

          context('when the wallet has enough balance', async () => {
            beforeEach('mint tokens', async () => {
              await tokenIn.mint(wallet.address, amount)
            })

            context('when the swap connector provides a worse rate', () => {
              const SWAP_CONNECTOR_SLIPPAGE = fp(0.01)
              const SWAP_CONNECTOR_RATE = ORACLE_RATE.mul(fp(1).sub(SWAP_CONNECTOR_SLIPPAGE)).div(fp(1))
              const expectedAmountOut = amount.mul(SWAP_CONNECTOR_RATE).div(fp(1))

              beforeEach('mock swap connector rate', async () => {
                await swapConnector.mockRate(SWAP_CONNECTOR_RATE)
              })

              context('when the user accepts that slippage', () => {
                const slippage = SWAP_CONNECTOR_SLIPPAGE
                const expectedMinAmountOut = oracleAmountOut.mul(fp(1).sub(slippage)).div(fp(1))

                itSwapsAsExpected(limitType, slippage, expectedAmountOut, expectedMinAmountOut)
              })

              context('when the user does not accept that slippage', () => {
                const slippage = SWAP_CONNECTOR_SLIPPAGE.sub(1)

                beforeEach('fund swap connector', async () => {
                  await tokenOut.mint(swapConnector.address, amount.mul(SWAP_CONNECTOR_RATE).div(fp(1)))
                })

                it('reverts', async () => {
                  await expect(
                    wallet.swap(source, tokenIn.address, tokenOut.address, amount, limitType, slippage, data)
                  ).to.be.revertedWith('SWAP_MIN_AMOUNT')
                })
              })
            })

            context('when the swap connector provides the same rate', () => {
              const SWAP_CONNECTOR_RATE = ORACLE_RATE
              const expectedAmountOut = amount.mul(SWAP_CONNECTOR_RATE).div(fp(1))

              beforeEach('mock swap connector rate', async () => {
                await swapConnector.mockRate(SWAP_CONNECTOR_RATE)
              })

              context('when the user accepts no slippage', () => {
                const slippage = 0
                const expectedMinAmountOut = oracleAmountOut.mul(fp(1).sub(slippage)).div(fp(1))

                itSwapsAsExpected(limitType, slippage, expectedAmountOut, expectedMinAmountOut)
              })

              context('when the user accepts a higher slippage', () => {
                const slippage = fp(0.2)
                const expectedMinAmountOut = oracleAmountOut.mul(fp(1).sub(slippage)).div(fp(1))

                itSwapsAsExpected(limitType, slippage, expectedAmountOut, expectedMinAmountOut)
              })
            })

            context('when the swap connector provides a better rate', () => {
              const SWAP_CONNECTOR_RATE = ORACLE_RATE.add(fp(0.01))
              const expectedAmountOut = amount.mul(SWAP_CONNECTOR_RATE).div(fp(1))

              beforeEach('mock swap connector rate', async () => {
                await swapConnector.mockRate(SWAP_CONNECTOR_RATE)
              })

              context('when the user accepts no slippage', () => {
                const slippage = 0
                const expectedMinAmountOut = oracleAmountOut.mul(fp(1).sub(slippage)).div(fp(1))

                itSwapsAsExpected(limitType, slippage, expectedAmountOut, expectedMinAmountOut)
              })

              context('when the user accepts a higher slippage', () => {
                const slippage = fp(0.2)
                const expectedMinAmountOut = oracleAmountOut.mul(fp(1).sub(slippage)).div(fp(1))

                itSwapsAsExpected(limitType, slippage, expectedAmountOut, expectedMinAmountOut)
              })
            })
          })

          context('when the wallet does not have enough balance', () => {
            it('reverts', async () => {
              await expect(
                wallet.swap(source, tokenIn.address, tokenOut.address, amount, limitType, 0, data)
              ).to.be.revertedWith('ERC20: transfer amount exceeds balance')
            })
          })
        })

        context('when the given slippage is not valid', () => {
          const slippage = fp(1.01)

          it('reverts', async () => {
            await expect(
              wallet.swap(source, tokenIn.address, tokenOut.address, amount, limitType, slippage, data)
            ).to.be.revertedWith('SLIPPAGE_ABOVE_ONE')
          })
        })
      })

      context('when using a min amount out limit', () => {
        const PRETENDED_RATE = fp(2)
        const limitType = SWAP_LIMIT.MIN_AMOUNT_OUT
        const minAmountOut = amount.mul(PRETENDED_RATE).div(fp(1))

        context('when the wallet has enough balance', async () => {
          beforeEach('mint tokens', async () => {
            await tokenIn.mint(wallet.address, amount)
          })

          context('when the swap connector provides a worse rate', () => {
            const SWAP_CONNECTOR_RATE = PRETENDED_RATE.sub(fp(0.5))

            beforeEach('mock rate and fund swap connector', async () => {
              await swapConnector.mockRate(SWAP_CONNECTOR_RATE)
              await tokenOut.mint(swapConnector.address, amount.mul(SWAP_CONNECTOR_RATE).div(fp(1)))
            })

            it('reverts', async () => {
              await expect(
                wallet.swap(source, tokenIn.address, tokenOut.address, amount, limitType, minAmountOut, data)
              ).to.be.revertedWith('SWAP_MIN_AMOUNT')
            })
          })

          context('when the swap connector provides the same rate', () => {
            const SWAP_CONNECTOR_RATE = PRETENDED_RATE
            const expectedAmountOut = amount.mul(SWAP_CONNECTOR_RATE).div(fp(1))

            beforeEach('mock rate', async () => {
              await swapConnector.mockRate(SWAP_CONNECTOR_RATE)
            })

            itSwapsAsExpected(limitType, minAmountOut, expectedAmountOut, minAmountOut)
          })

          context('when the swap connector provides a better rate', () => {
            const SWAP_CONNECTOR_RATE = PRETENDED_RATE.add(fp(0.5))
            const expectedAmountOut = amount.mul(SWAP_CONNECTOR_RATE).div(fp(1))

            beforeEach('mock rate', async () => {
              await swapConnector.mockRate(SWAP_CONNECTOR_RATE)
            })

            itSwapsAsExpected(limitType, minAmountOut, expectedAmountOut, minAmountOut)
          })
        })

        context('when the wallet does not have enough balance', () => {
          it('reverts', async () => {
            await expect(
              wallet.swap(source, tokenIn.address, tokenOut.address, amount, limitType, minAmountOut, data)
            ).to.be.revertedWith('ERC20: transfer amount exceeds balance')
          })
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.swap(source, tokenIn.address, tokenOut.address, amount, 0, 0, data)).to.be.revertedWith(
          'AUTH_SENDER_NOT_ALLOWED'
        )
      })
    })
  })
})
