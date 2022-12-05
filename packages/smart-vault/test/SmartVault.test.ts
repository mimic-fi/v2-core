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
  itBehavesLikeAuthorizer,
  MONTH,
  NATIVE_TOKEN_ADDRESS,
  ZERO_ADDRESS,
} from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { ethers } from 'hardhat'

describe('SmartVault', () => {
  let smartVault: Contract, registry: Contract, wrappedNativeToken: Contract
  let strategy: Contract, priceOracle: Contract, swapConnector: Contract, bridgeConnector: Contract
  let admin: SignerWithAddress, other: SignerWithAddress, feeCollector: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin, other, feeCollector] = await getSigners()
  })

  beforeEach('deploy smart vault', async () => {
    registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [admin.address])
    wrappedNativeToken = await deploy('WrappedNativeTokenMock')
    const implementation = await deploy('SmartVault', [wrappedNativeToken.address, registry.address])
    await registry.connect(admin).register(await implementation.NAMESPACE(), implementation.address, false)
    const initializeData = implementation.interface.encodeFunctionData('initialize', [admin.address])
    const tx = await registry.clone(implementation.address, initializeData)
    const event = await assertEvent(tx, 'Cloned', { implementation })
    smartVault = await instanceAt('SmartVault', event.args.instance)
  })

  beforeEach('deploy smart vault dependencies', async () => {
    const setFeeCollectorRole = smartVault.interface.getSighash('setFeeCollector')
    await smartVault.connect(admin).authorize(admin.address, setFeeCollectorRole)
    await smartVault.connect(admin).setFeeCollector(feeCollector.address)

    const setStrategyRole = smartVault.interface.getSighash('setStrategy')
    await smartVault.connect(admin).authorize(admin.address, setStrategyRole)
    strategy = await deploy('StrategyMock', [registry.address])
    await registry.connect(admin).register(await strategy.NAMESPACE(), strategy.address, true)
    await smartVault.connect(admin).setStrategy(strategy.address, true)

    const setPriceOracleRole = smartVault.interface.getSighash('setPriceOracle')
    await smartVault.connect(admin).authorize(admin.address, setPriceOracleRole)
    priceOracle = await deploy('PriceOracleMock', [registry.address])
    await registry.connect(admin).register(await priceOracle.NAMESPACE(), priceOracle.address, true)
    await smartVault.connect(admin).setPriceOracle(priceOracle.address)

    const setSwapConnectorRole = smartVault.interface.getSighash('setSwapConnector')
    await smartVault.connect(admin).authorize(admin.address, setSwapConnectorRole)
    swapConnector = await deploy('SwapConnectorMock', [registry.address])
    await registry.connect(admin).register(await swapConnector.NAMESPACE(), swapConnector.address, true)
    await smartVault.connect(admin).setSwapConnector(swapConnector.address)

    const setBridgeConnectorRole = smartVault.interface.getSighash('setBridgeConnector')
    await smartVault.connect(admin).authorize(admin.address, setBridgeConnectorRole)
    bridgeConnector = await deploy('BridgeConnectorMock', [registry.address])
    await registry.connect(admin).register(await bridgeConnector.NAMESPACE(), bridgeConnector.address, true)
    await smartVault.connect(admin).setBridgeConnector(bridgeConnector.address)
  })

  describe('initialization', async () => {
    it('has a registry reference', async () => {
      expect(await smartVault.registry()).to.be.equal(registry.address)
    })

    it('cannot be initialized twice', async () => {
      await expect(smartVault.initialize(admin.address)).to.be.revertedWith(
        'Initializable: contract is already initialized'
      )
    })

    it('its implementation is already initialized', async () => {
      const implementation = await instanceAt('SmartVault', await registry.implementationOf(smartVault.address))
      await expect(implementation.initialize(admin.address)).to.be.revertedWith(
        'Initializable: contract is already initialized'
      )
    })

    it('is properly registered in the registry', async () => {
      const implementation = await registry.implementationOf(smartVault.address)
      const implementationData = await registry.implementationData(implementation)

      expect(implementationData.deprecated).to.be.false
      expect(implementationData.namespace).to.be.equal(await smartVault.NAMESPACE())
    })

    it('has the proper wrapped native token reference', async () => {
      expect(await smartVault.wrappedNativeToken()).to.be.equal(wrappedNativeToken.address)
    })

    it('has the expected namespace', async () => {
      expect(await smartVault.NAMESPACE()).to.be.equal(ethers.utils.solidityKeccak256(['string'], ['SMART_VAULT']))
    })
  })

  describe('authorizer', () => {
    beforeEach('setup authorizer tests', async function () {
      this.admin = admin
      this.authorizer = smartVault
    })

    itBehavesLikeAuthorizer()
  })

  describe('setStrategy', () => {
    let anotherStrategy: Contract

    beforeEach('deploy implementation', async () => {
      anotherStrategy = await deploy('StrategyMock', [registry.address])
    })

    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setStrategyRole = smartVault.interface.getSighash('setStrategy')
        await smartVault.connect(admin).authorize(admin.address, setStrategyRole)
        smartVault = smartVault.connect(admin)
      })

      const itCanBeSet = (allowed: boolean) => {
        it(`${allowed ? 'allows' : 'disallows'} the strategy`, async () => {
          await smartVault.setStrategy(anotherStrategy.address, allowed)

          expect(await smartVault.isStrategyAllowed(anotherStrategy.address)).to.be.equal(allowed)
        })

        it('emits an event', async () => {
          const tx = await smartVault.setStrategy(anotherStrategy.address, allowed)

          await assertEvent(tx, 'StrategySet', { strategy: anotherStrategy, allowed })
        })
      }

      context('when the implementation is registered', () => {
        beforeEach('register implementation', async () => {
          await registry.connect(admin).register(await anotherStrategy.NAMESPACE(), anotherStrategy.address, true)
        })

        context('when the allowing the strategy', () => {
          itCanBeSet(true)
        })

        context('when the disallowing the strategy', () => {
          itCanBeSet(false)
        })
      })

      context('when the implementation is not registered', () => {
        context('when the allowing the strategy', () => {
          it('reverts', async () => {
            await expect(smartVault.setStrategy(anotherStrategy.address, true)).to.be.revertedWith(
              'DEPENDENCY_NOT_REGISTERED'
            )
          })
        })

        context('when the disallowing the strategy', () => {
          itCanBeSet(false)
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.setStrategy(anotherStrategy.address, true)).to.be.revertedWith(
          'AUTH_SENDER_NOT_ALLOWED'
        )
      })
    })
  })

  describe('setPriceOracle', () => {
    let newOracle: Contract

    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setPriceOracleRole = smartVault.interface.getSighash('setPriceOracle')
        await smartVault.connect(admin).authorize(admin.address, setPriceOracleRole)
        smartVault = smartVault.connect(admin)
      })

      context('when the implementation is registered', async () => {
        beforeEach('deploy implementation', async () => {
          newOracle = await deploy('PriceOracleMock', [registry.address])
          await registry.connect(admin).register(await newOracle.NAMESPACE(), newOracle.address, true)
        })

        it('sets the implementation', async () => {
          await smartVault.setPriceOracle(newOracle.address)

          const oracle = await smartVault.priceOracle()
          expect(oracle).to.be.equal(newOracle.address)
        })

        it('emits an event', async () => {
          const tx = await smartVault.setPriceOracle(newOracle.address)
          await assertEvent(tx, 'PriceOracleSet', { priceOracle: newOracle })
        })
      })

      context('when the implementation is not registered', async () => {
        beforeEach('deploy implementation', async () => {
          newOracle = await deploy('PriceOracleMock', [registry.address])
        })

        it('reverts', async () => {
          await expect(smartVault.setPriceOracle(newOracle.address)).to.be.revertedWith('DEPENDENCY_NOT_REGISTERED')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.setPriceOracle(ZERO_ADDRESS)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setSwapConnector', () => {
    let newSwapConnector: Contract

    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setSwapConnectorRole = smartVault.interface.getSighash('setSwapConnector')
        await smartVault.connect(admin).authorize(admin.address, setSwapConnectorRole)
        smartVault = smartVault.connect(admin)
      })

      context('when the implementation is registered', async () => {
        beforeEach('deploy implementation', async () => {
          newSwapConnector = await deploy('SwapConnectorMock', [registry.address])
          await registry.connect(admin).register(await newSwapConnector.NAMESPACE(), newSwapConnector.address, true)
        })

        it('sets the implementation', async () => {
          await smartVault.setSwapConnector(newSwapConnector.address)

          const swapConnector = await smartVault.swapConnector()
          expect(swapConnector).to.be.equal(newSwapConnector.address)
        })

        it('emits an event', async () => {
          const tx = await smartVault.setSwapConnector(newSwapConnector.address)
          await assertEvent(tx, 'SwapConnectorSet', { swapConnector: newSwapConnector })
        })
      })

      context('when the implementation is not registered', async () => {
        beforeEach('deploy implementation', async () => {
          newSwapConnector = await deploy('SwapConnectorMock', [registry.address])
        })

        it('reverts', async () => {
          await expect(smartVault.setSwapConnector(newSwapConnector.address)).to.be.revertedWith(
            'DEPENDENCY_NOT_REGISTERED'
          )
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.setSwapConnector(ZERO_ADDRESS)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setBridgeConnector', () => {
    let newBridgeConnector: Contract

    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setBridgeConnectorRole = smartVault.interface.getSighash('setBridgeConnector')
        await smartVault.connect(admin).authorize(admin.address, setBridgeConnectorRole)
        smartVault = smartVault.connect(admin)
      })

      context('when the implementation is registered', async () => {
        beforeEach('deploy implementation', async () => {
          newBridgeConnector = await deploy('BridgeConnectorMock', [registry.address])
          await registry.connect(admin).register(await newBridgeConnector.NAMESPACE(), newBridgeConnector.address, true)
        })

        it('sets the implementation', async () => {
          await smartVault.setBridgeConnector(newBridgeConnector.address)

          const bridgeConnector = await smartVault.bridgeConnector()
          expect(bridgeConnector).to.be.equal(newBridgeConnector.address)
        })

        it('emits an event', async () => {
          const tx = await smartVault.setBridgeConnector(newBridgeConnector.address)
          await assertEvent(tx, 'BridgeConnectorSet', { bridgeConnector: newBridgeConnector })
        })
      })

      context('when the implementation is not registered', async () => {
        beforeEach('deploy implementation', async () => {
          newBridgeConnector = await deploy('BridgeConnectorMock', [registry.address])
        })

        it('reverts', async () => {
          await expect(smartVault.setBridgeConnector(newBridgeConnector.address)).to.be.revertedWith(
            'DEPENDENCY_NOT_REGISTERED'
          )
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.setBridgeConnector(ZERO_ADDRESS)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setFeeCollector', () => {
    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setFeeCollectorRole = smartVault.interface.getSighash('setFeeCollector')
        await smartVault.connect(admin).authorize(admin.address, setFeeCollectorRole)
        smartVault = smartVault.connect(admin)
      })

      context('when the new address is not zero', async () => {
        let newFeeCollector: SignerWithAddress

        beforeEach('set new fee collector', async () => {
          newFeeCollector = other
        })

        it('sets the fee collector', async () => {
          await smartVault.setFeeCollector(newFeeCollector.address)

          const collector = await smartVault.feeCollector()
          expect(collector).to.be.equal(newFeeCollector.address)
        })

        it('emits an event', async () => {
          const tx = await smartVault.setFeeCollector(newFeeCollector.address)
          await assertEvent(tx, 'FeeCollectorSet', { feeCollector: newFeeCollector })
        })
      })

      context('when the new address is zero', async () => {
        const newFeeCollector = ZERO_ADDRESS

        it('reverts', async () => {
          await expect(smartVault.setFeeCollector(newFeeCollector)).to.be.revertedWith('FEE_COLLECTOR_ZERO')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.setFeeCollector(ZERO_ADDRESS)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setWithdrawFee', () => {
    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setWithdrawFeeRole = smartVault.interface.getSighash('setWithdrawFee')
        await smartVault.connect(admin).authorize(admin.address, setWithdrawFeeRole)
        smartVault = smartVault.connect(admin)
      })

      context('when there was no withdraw fee set yet', () => {
        context('when the pct is below one', async () => {
          const itSetsTheFeeCorrectly = (pct: BigNumberish, cap: BigNumberish, token: string, period: BigNumberish) => {
            it('sets the withdraw fee', async () => {
              await smartVault.setWithdrawFee(pct, cap, token, period)

              const fee = await smartVault.withdrawFee()
              expect(fee.pct).to.be.equal(pct)
              expect(fee.cap).to.be.equal(cap)
              expect(fee.token).to.be.equal(token)
              expect(fee.period).to.be.equal(period)
              expect(fee.totalCharged).to.be.equal(0)
              expect(fee.nextResetTime).to.be.equal(cap != 0 ? (await currentTimestamp()).add(period) : 0)
            })

            it('emits an event', async () => {
              const tx = await smartVault.setWithdrawFee(pct, cap, token, period)
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
                    await expect(smartVault.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setWithdrawFee(pct, cap, token, period)).to.be.revertedWith(
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
            await expect(smartVault.setWithdrawFee(pct, 0, ZERO_ADDRESS, 0)).to.be.revertedWith('FEE_PCT_ABOVE_ONE')
          })
        })
      })

      context('when there was a withdraw fee already set', () => {
        const pct = fp(0.01)
        const cap = fp(200)
        const period = MONTH * 2
        const token = NATIVE_TOKEN_ADDRESS

        beforeEach('set withdraw fee', async () => {
          await smartVault.setWithdrawFee(pct, cap, token, period)
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
            const { nextResetTime: previousResetTime } = await smartVault.withdrawFee()

            await smartVault.setWithdrawFee(newPct, newCap, newToken.address, newPeriod)

            const fee = await smartVault.withdrawFee()
            expect(fee.pct).to.be.equal(newPct)
            expect(fee.cap).to.be.equal(newCap)
            expect(fee.token).to.be.equal(newToken.address)
            expect(fee.period).to.be.equal(newPeriod)
            expect(fee.totalCharged).to.be.equal(0)
            expect(fee.nextResetTime).to.be.equal(previousResetTime)
          })

          it('emits an event', async () => {
            const tx = await smartVault.setWithdrawFee(newPct, newCap, newToken.address, newPeriod)
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
            await newToken.mint(smartVault.address, amount)
            const withdrawRole = smartVault.interface.getSighash('withdraw')
            await smartVault.connect(admin).authorize(admin.address, withdrawRole)
            await priceOracle.mockRate(newToken.address, token, fp(1))
            await smartVault.withdraw(newToken.address, amount, other.address, '0x')
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
              const previousFeeData = await smartVault.withdrawFee()

              await smartVault.setWithdrawFee(newPct, newCap, newToken.address, newPeriod)

              const fee = await smartVault.withdrawFee()
              expect(fee.pct).to.be.equal(newPct)
              expect(fee.cap).to.be.equal(newCap)
              expect(fee.token).to.be.equal(newToken.address)
              expect(fee.period).to.be.equal(newPeriod)
              expect(fee.totalCharged).to.be.equal(previousFeeData.totalCharged.mul(rate))
              expect(fee.nextResetTime).to.be.equal(previousFeeData.nextResetTime)
            })

            it('emits an event', async () => {
              const tx = await smartVault.setWithdrawFee(newPct, newCap, newToken.address, newPeriod)
              await assertEvent(tx, 'WithdrawFeeSet', { pct: newPct, cap: newCap, token: newToken, period: newPeriod })
            })
          })

          context('when the fee cap is being removed', () => {
            const newPct = fp(0.3)
            const newCap = 0
            const newPeriod = 0
            const newToken = ZERO_ADDRESS

            it('sets the withdraw fee and resets the totalizators', async () => {
              await smartVault.setWithdrawFee(newPct, newCap, newToken, newPeriod)

              const fee = await smartVault.withdrawFee()
              expect(fee.pct).to.be.equal(newPct)
              expect(fee.cap).to.be.equal(newCap)
              expect(fee.token).to.be.equal(newToken)
              expect(fee.period).to.be.equal(newPeriod)
              expect(fee.totalCharged).to.be.equal(0)
              expect(fee.nextResetTime).to.be.equal(0)
            })

            it('emits an event', async () => {
              const tx = await smartVault.setWithdrawFee(newPct, newCap, newToken, newPeriod)
              await assertEvent(tx, 'WithdrawFeeSet', { pct: newPct, cap: newCap, token: newToken, period: newPeriod })
            })
          })
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.setWithdrawFee(0, 0, ZERO_ADDRESS, 0)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setPerformanceFee', () => {
    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setPerformanceFeeRole = smartVault.interface.getSighash('setPerformanceFee')
        await smartVault.connect(admin).authorize(admin.address, setPerformanceFeeRole)
        smartVault = smartVault.connect(admin)
      })

      context('when there was no performance fee set yet', () => {
        context('when the pct is below one', async () => {
          const itSetsTheFeeCorrectly = (pct: BigNumberish, cap: BigNumberish, token: string, period: BigNumberish) => {
            it('sets the performance fee', async () => {
              await smartVault.setPerformanceFee(pct, cap, token, period)

              const fee = await smartVault.performanceFee()
              expect(fee.pct).to.be.equal(pct)
              expect(fee.cap).to.be.equal(cap)
              expect(fee.token).to.be.equal(token)
              expect(fee.period).to.be.equal(period)
              expect(fee.totalCharged).to.be.equal(0)
              expect(fee.nextResetTime).to.be.equal(cap != 0 ? (await currentTimestamp()).add(period) : 0)
            })

            it('emits an event', async () => {
              const tx = await smartVault.setPerformanceFee(pct, cap, token, period)
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
                    await expect(smartVault.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setPerformanceFee(pct, cap, token, period)).to.be.revertedWith(
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
            await expect(smartVault.setPerformanceFee(pct, 0, ZERO_ADDRESS, 0)).to.be.revertedWith('FEE_PCT_ABOVE_ONE')
          })
        })
      })

      context('when there was a performance fee already set', () => {
        const pct = fp(0.01)
        const cap = fp(200)
        const period = MONTH * 2
        const token = NATIVE_TOKEN_ADDRESS

        beforeEach('set performance fee', async () => {
          await smartVault.setPerformanceFee(pct, cap, token, period)
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
            const { nextResetTime: previousResetTime } = await smartVault.performanceFee()

            await smartVault.setPerformanceFee(newPct, newCap, newToken.address, newPeriod)

            const fee = await smartVault.performanceFee()
            expect(fee.pct).to.be.equal(newPct)
            expect(fee.cap).to.be.equal(newCap)
            expect(fee.token).to.be.equal(newToken.address)
            expect(fee.period).to.be.equal(newPeriod)
            expect(fee.totalCharged).to.be.equal(0)
            expect(fee.nextResetTime).to.be.equal(previousResetTime)
          })

          it('emits an event', async () => {
            const tx = await smartVault.setPerformanceFee(newPct, newCap, newToken.address, newPeriod)
            await assertEvent(tx, 'PerformanceFeeSet', { pct: newPct, cap: newCap, token: newToken, period: newPeriod })
          })
        })

        context('when there where some charged fees already', () => {
          let newToken: Contract

          beforeEach('deploy token', async () => {
            newToken = await deploy('TokenMock', ['TKN'])
          })

          beforeEach('accrue performance fee', async () => {
            const joinRole = smartVault.interface.getSighash('join')
            await smartVault.connect(admin).authorize(admin.address, joinRole)
            const exitRole = smartVault.interface.getSighash('exit')
            await smartVault.connect(admin).authorize(admin.address, exitRole)

            const amount = fp(50)
            const strategyToken = await instanceAt('TokenMock', await strategy.token())
            await strategyToken.mint(smartVault.address, amount)
            await smartVault.join(strategy.address, [strategyToken.address], [amount], 0, '0x')
            await strategy.mockGains(smartVault.address, 2)
            await priceOracle.mockRate(strategyToken.address, token, fp(1))
            await smartVault.exit(strategy.address, [await strategy.lpt()], [fp(1)], 0, '0x')
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
              const previousFeeData = await smartVault.performanceFee()

              await smartVault.setPerformanceFee(newPct, newCap, newToken.address, newPeriod)

              const fee = await smartVault.performanceFee()
              expect(fee.pct).to.be.equal(newPct)
              expect(fee.cap).to.be.equal(newCap)
              expect(fee.token).to.be.equal(newToken.address)
              expect(fee.period).to.be.equal(newPeriod)
              expect(fee.totalCharged).to.be.equal(previousFeeData.totalCharged.mul(rate))
              expect(fee.nextResetTime).to.be.equal(previousFeeData.nextResetTime)
            })

            it('emits an event', async () => {
              const tx = await smartVault.setPerformanceFee(newPct, newCap, newToken.address, newPeriod)
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
              await smartVault.setPerformanceFee(newPct, newCap, newToken, newPeriod)

              const fee = await smartVault.performanceFee()
              expect(fee.pct).to.be.equal(newPct)
              expect(fee.cap).to.be.equal(newCap)
              expect(fee.token).to.be.equal(newToken)
              expect(fee.period).to.be.equal(newPeriod)
              expect(fee.totalCharged).to.be.equal(0)
              expect(fee.nextResetTime).to.be.equal(0)
            })

            it('emits an event', async () => {
              const tx = await smartVault.setPerformanceFee(newPct, newCap, newToken, newPeriod)
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
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.setPerformanceFee(0, 0, ZERO_ADDRESS, 0)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setSwapFee', () => {
    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setSwapFeeRole = smartVault.interface.getSighash('setSwapFee')
        await smartVault.connect(admin).authorize(admin.address, setSwapFeeRole)
        smartVault = smartVault.connect(admin)
      })

      context('when there was no swap fee set yet', () => {
        context('when the pct is below one', async () => {
          const itSetsTheFeeCorrectly = (pct: BigNumberish, cap: BigNumberish, token: string, period: BigNumberish) => {
            it('sets the swap fee', async () => {
              await smartVault.setSwapFee(pct, cap, token, period)

              const fee = await smartVault.swapFee()
              expect(fee.pct).to.be.equal(pct)
              expect(fee.cap).to.be.equal(cap)
              expect(fee.token).to.be.equal(token)
              expect(fee.period).to.be.equal(period)
              expect(fee.totalCharged).to.be.equal(0)
              expect(fee.nextResetTime).to.be.equal(cap != 0 ? (await currentTimestamp()).add(period) : 0)
            })

            it('emits an event', async () => {
              const tx = await smartVault.setSwapFee(pct, cap, token, period)
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
                    await expect(smartVault.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setSwapFee(pct, cap, token, period)).to.be.revertedWith(
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
            await expect(smartVault.setSwapFee(pct, 0, ZERO_ADDRESS, 0)).to.be.revertedWith('FEE_PCT_ABOVE_ONE')
          })
        })
      })

      context('when there was a swap fee already set', () => {
        const pct = fp(0.01)
        const cap = fp(200)
        const period = MONTH * 2
        const token = NATIVE_TOKEN_ADDRESS

        beforeEach('set swap fee', async () => {
          await smartVault.setSwapFee(pct, cap, token, period)
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
            const { nextResetTime: previousResetTime } = await smartVault.swapFee()

            await smartVault.setSwapFee(newPct, newCap, newToken.address, newPeriod)

            const fee = await smartVault.swapFee()
            expect(fee.pct).to.be.equal(newPct)
            expect(fee.cap).to.be.equal(newCap)
            expect(fee.token).to.be.equal(newToken.address)
            expect(fee.period).to.be.equal(newPeriod)
            expect(fee.totalCharged).to.be.equal(0)
            expect(fee.nextResetTime).to.be.equal(previousResetTime)
          })

          it('emits an event', async () => {
            const tx = await smartVault.setSwapFee(newPct, newCap, newToken.address, newPeriod)
            await assertEvent(tx, 'SwapFeeSet', { pct: newPct, cap: newCap, token: newToken, period: newPeriod })
          })
        })

        context('when there where some charged fees already', () => {
          let newToken: Contract

          beforeEach('deploy token', async () => {
            newToken = await deploy('TokenMock', ['TKN'])
          })

          beforeEach('accrue swap fee', async () => {
            const swapRole = smartVault.interface.getSighash('swap')
            await smartVault.connect(admin).authorize(admin.address, swapRole)

            const amount = fp(10)
            const anotherToken = await deploy('TokenMock', ['TKN'])
            await anotherToken.mint(smartVault.address, amount)
            await newToken.mint(await swapConnector.dex(), amount)
            await swapConnector.mockRate(fp(1))
            await priceOracle.mockRate(newToken.address, token, fp(1))
            await smartVault.swap(0, anotherToken.address, newToken.address, amount, 1, 0, '0x')
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
              const previousFeeData = await smartVault.swapFee()

              await smartVault.setSwapFee(newPct, newCap, newToken.address, newPeriod)

              const fee = await smartVault.swapFee()
              expect(fee.pct).to.be.equal(newPct)
              expect(fee.cap).to.be.equal(newCap)
              expect(fee.token).to.be.equal(newToken.address)
              expect(fee.period).to.be.equal(newPeriod)
              expect(fee.totalCharged).to.be.equal(previousFeeData.totalCharged.mul(rate))
              expect(fee.nextResetTime).to.be.equal(previousFeeData.nextResetTime)
            })

            it('emits an event', async () => {
              const tx = await smartVault.setSwapFee(newPct, newCap, newToken.address, newPeriod)
              await assertEvent(tx, 'SwapFeeSet', { pct: newPct, cap: newCap, token: newToken, period: newPeriod })
            })
          })

          context('when the fee cap is being removed', () => {
            const newPct = fp(0.3)
            const newCap = 0
            const newPeriod = 0
            const newToken = ZERO_ADDRESS

            it('sets the swap fee and resets the totalizators', async () => {
              await smartVault.setSwapFee(newPct, newCap, newToken, newPeriod)

              const fee = await smartVault.swapFee()
              expect(fee.pct).to.be.equal(newPct)
              expect(fee.cap).to.be.equal(newCap)
              expect(fee.token).to.be.equal(newToken)
              expect(fee.period).to.be.equal(newPeriod)
              expect(fee.totalCharged).to.be.equal(0)
              expect(fee.nextResetTime).to.be.equal(0)
            })

            it('emits an event', async () => {
              const tx = await smartVault.setSwapFee(newPct, newCap, newToken, newPeriod)
              await assertEvent(tx, 'SwapFeeSet', { pct: newPct, cap: newCap, token: newToken, period: newPeriod })
            })
          })
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.setSwapFee(0, 0, ZERO_ADDRESS, 0)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setBridgeFee', () => {
    context('when the sender is authorized', async () => {
      beforeEach('set sender', async () => {
        const setBridgeFeeRole = smartVault.interface.getSighash('setBridgeFee')
        await smartVault.connect(admin).authorize(admin.address, setBridgeFeeRole)
        smartVault = smartVault.connect(admin)
      })

      context('when there was no bridge fee set yet', () => {
        context('when the pct is below one', async () => {
          const itSetsTheFeeCorrectly = (pct: BigNumberish, cap: BigNumberish, token: string, period: BigNumberish) => {
            it('sets the bridge fee', async () => {
              await smartVault.setBridgeFee(pct, cap, token, period)

              const fee = await smartVault.bridgeFee()
              expect(fee.pct).to.be.equal(pct)
              expect(fee.cap).to.be.equal(cap)
              expect(fee.token).to.be.equal(token)
              expect(fee.period).to.be.equal(period)
              expect(fee.totalCharged).to.be.equal(0)
              expect(fee.nextResetTime).to.be.equal(cap != 0 ? (await currentTimestamp()).add(period) : 0)
            })

            it('emits an event', async () => {
              const tx = await smartVault.setBridgeFee(pct, cap, token, period)
              await assertEvent(tx, 'BridgeFeeSet', { pct, cap, token, period })
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
                    await expect(smartVault.setBridgeFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setBridgeFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setBridgeFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setBridgeFee(pct, cap, token, period)).to.be.revertedWith(
                      'INCONSISTENT_CAP_VALUES'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setBridgeFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setBridgeFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setBridgeFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setBridgeFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setBridgeFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setBridgeFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setBridgeFee(pct, cap, token, period)).to.be.revertedWith(
                      'INVALID_CAP_WITH_FEE_ZERO'
                    )
                  })
                })

                context('when the cap period is zero', async () => {
                  const period = 0

                  it('reverts', async () => {
                    await expect(smartVault.setBridgeFee(pct, cap, token, period)).to.be.revertedWith(
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
                    await expect(smartVault.setBridgeFee(pct, cap, token, period)).to.be.revertedWith(
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
            await expect(smartVault.setBridgeFee(pct, 0, ZERO_ADDRESS, 0)).to.be.revertedWith('FEE_PCT_ABOVE_ONE')
          })
        })
      })

      context('when there was a bridge fee already set', () => {
        const pct = fp(0.01)
        const cap = fp(200)
        const period = MONTH * 2
        const token = NATIVE_TOKEN_ADDRESS

        beforeEach('set bridge fee', async () => {
          await smartVault.setBridgeFee(pct, cap, token, period)
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

          it('sets the bridge fee without updating the next reset time', async () => {
            const { nextResetTime: previousResetTime } = await smartVault.bridgeFee()

            await smartVault.setBridgeFee(newPct, newCap, newToken.address, newPeriod)

            const fee = await smartVault.bridgeFee()
            expect(fee.pct).to.be.equal(newPct)
            expect(fee.cap).to.be.equal(newCap)
            expect(fee.token).to.be.equal(newToken.address)
            expect(fee.period).to.be.equal(newPeriod)
            expect(fee.totalCharged).to.be.equal(0)
            expect(fee.nextResetTime).to.be.equal(previousResetTime)
          })

          it('emits an event', async () => {
            const tx = await smartVault.setBridgeFee(newPct, newCap, newToken.address, newPeriod)
            await assertEvent(tx, 'BridgeFeeSet', { pct: newPct, cap: newCap, token: newToken, period: newPeriod })
          })
        })

        context('when there where some charged fees already', () => {
          let newToken: Contract

          beforeEach('deploy token', async () => {
            newToken = await deploy('TokenMock', ['TKN'])
          })

          beforeEach('accrue bridge fees', async () => {
            const bridgeRole = smartVault.interface.getSighash('bridge')
            await smartVault.connect(admin).authorize(admin.address, bridgeRole)

            const amount = fp(10)
            await newToken.mint(smartVault.address, amount)
            await priceOracle.mockRate(newToken.address, token, fp(1))
            await smartVault.bridge(0, 0, newToken.address, amount, 1, 0, '0x')
          })

          context('when the fee cap is being changed', () => {
            const rate = 2
            const newPct = pct.mul(rate)
            const newCap = cap.mul(rate)
            const newPeriod = period * rate

            beforeEach('mock new token rate', async () => {
              await priceOracle.mockRate(token, newToken.address, fp(rate))
            })

            it('sets the bridge fee without updating the next reset time', async () => {
              const previousFeeData = await smartVault.bridgeFee()

              await smartVault.setBridgeFee(newPct, newCap, newToken.address, newPeriod)

              const fee = await smartVault.bridgeFee()
              expect(fee.pct).to.be.equal(newPct)
              expect(fee.cap).to.be.equal(newCap)
              expect(fee.token).to.be.equal(newToken.address)
              expect(fee.period).to.be.equal(newPeriod)
              expect(fee.totalCharged).to.be.equal(previousFeeData.totalCharged.mul(rate))
              expect(fee.nextResetTime).to.be.equal(previousFeeData.nextResetTime)
            })

            it('emits an event', async () => {
              const tx = await smartVault.setBridgeFee(newPct, newCap, newToken.address, newPeriod)
              await assertEvent(tx, 'BridgeFeeSet', { pct: newPct, cap: newCap, token: newToken, period: newPeriod })
            })
          })

          context('when the fee cap is being removed', () => {
            const newPct = fp(0.3)
            const newCap = 0
            const newPeriod = 0
            const newToken = ZERO_ADDRESS

            it('sets the bridge fee and resets the totalizators', async () => {
              await smartVault.setBridgeFee(newPct, newCap, newToken, newPeriod)

              const fee = await smartVault.bridgeFee()
              expect(fee.pct).to.be.equal(newPct)
              expect(fee.cap).to.be.equal(newCap)
              expect(fee.token).to.be.equal(newToken)
              expect(fee.period).to.be.equal(newPeriod)
              expect(fee.totalCharged).to.be.equal(0)
              expect(fee.nextResetTime).to.be.equal(0)
            })

            it('emits an event', async () => {
              const tx = await smartVault.setBridgeFee(newPct, newCap, newToken, newPeriod)
              await assertEvent(tx, 'BridgeFeeSet', { pct: newPct, cap: newCap, token: newToken, period: newPeriod })
            })
          })
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.setBridgeFee(0, 0, ZERO_ADDRESS, 0)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setPriceFeed', () => {
    let feed: Contract, base: Contract, quote: Contract

    beforeEach('deploy feed and tokens', async () => {
      feed = await deploy('ContractMock')
      base = await deploy('TokenMock', ['BASE'])
      quote = await deploy('TokenMock', ['QUOTE'])
    })

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const setPriceFeedRole = smartVault.interface.getSighash('setPriceFeed')
        await smartVault.connect(admin).authorize(admin.address, setPriceFeedRole)
        smartVault = smartVault.connect(admin)
      })

      const itCanBeSet = () => {
        it('can be set', async () => {
          const tx = await smartVault.setPriceFeed(base.address, quote.address, feed.address)

          expect(await smartVault.getPriceFeed(base.address, quote.address)).to.be.equal(feed.address)

          await assertEvent(tx, 'PriceFeedSet', { base, quote, feed })
        })
      }

      const itCanBeUnset = () => {
        it('can be unset', async () => {
          const tx = await smartVault.setPriceFeed(base.address, quote.address, ZERO_ADDRESS)

          expect(await smartVault.getPriceFeed(base.address, quote.address)).to.be.equal(ZERO_ADDRESS)

          await assertEvent(tx, 'PriceFeedSet', { base, quote, feed: ZERO_ADDRESS })
        })
      }

      context('when the feed is set', () => {
        beforeEach('set feed', async () => {
          await smartVault.setPriceFeed(base.address, quote.address, feed.address)
          expect(await smartVault.getPriceFeed(base.address, quote.address)).to.be.equal(feed.address)
        })

        itCanBeSet()
        itCanBeUnset()
      })

      context('when the feed is not set', () => {
        beforeEach('unset feed', async () => {
          await smartVault.setPriceFeed(base.address, quote.address, ZERO_ADDRESS)
          expect(await smartVault.getPriceFeed(base.address, quote.address)).to.be.equal(ZERO_ADDRESS)
        })

        itCanBeSet()
        itCanBeUnset()
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.setPriceFeed(base.address, quote.address, feed.address)).to.be.revertedWith(
          'AUTH_SENDER_NOT_ALLOWED'
        )
      })
    })
  })

  describe('setPriceFeeds', () => {
    let bases: string[], quotes: string[], feeds: string[]
    let feed1: Contract, feed2: Contract, base1: Contract, base2: Contract, quote: Contract

    beforeEach('deploy feed and tokens', async () => {
      feed1 = await deploy('ContractMock')
      feed2 = await deploy('ContractMock')
      base1 = await deploy('TokenMock', ['BASE1'])
      base2 = await deploy('TokenMock', ['BASE2'])
      quote = await deploy('TokenMock', ['QUOTE'])

      bases = [base1.address, base2.address]
      quotes = [quote.address, quote.address]
      feeds = [feed1.address, feed2.address]
    })

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const setPriceFeedsRole = smartVault.interface.getSighash('setPriceFeeds')
        await smartVault.connect(admin).authorize(admin.address, setPriceFeedsRole)
        smartVault = smartVault.connect(admin)
      })

      context('when the input length is valid', () => {
        const itCanBeSet = () => {
          it('can be set', async () => {
            const tx = await smartVault.setPriceFeeds(bases, quotes, feeds)

            expect(await smartVault.getPriceFeed(base1.address, quote.address)).to.be.equal(feed1.address)
            expect(await smartVault.getPriceFeed(base2.address, quote.address)).to.be.equal(feed2.address)

            await assertEvent(tx, 'PriceFeedSet', { base: base1, quote, feed: feed1 })
            await assertEvent(tx, 'PriceFeedSet', { base: base2, quote, feed: feed2 })
          })
        }

        const itCanBeUnset = () => {
          it('can be unset', async () => {
            const tx = await smartVault.setPriceFeeds(bases, quotes, [ZERO_ADDRESS, ZERO_ADDRESS])

            expect(await smartVault.getPriceFeed(base1.address, quote.address)).to.be.equal(ZERO_ADDRESS)
            expect(await smartVault.getPriceFeed(base2.address, quote.address)).to.be.equal(ZERO_ADDRESS)

            await assertEvent(tx, 'PriceFeedSet', { base: base1, quote, feed: ZERO_ADDRESS })
            await assertEvent(tx, 'PriceFeedSet', { base: base2, quote, feed: ZERO_ADDRESS })
          })
        }

        context('when the feed is set', () => {
          beforeEach('set feed', async () => {
            await smartVault.setPriceFeeds(bases, quotes, feeds)
            expect(await smartVault.getPriceFeed(base1.address, quote.address)).to.be.equal(feed1.address)
            expect(await smartVault.getPriceFeed(base2.address, quote.address)).to.be.equal(feed2.address)
          })

          itCanBeSet()
          itCanBeUnset()
        })

        context('when the feed is not set', () => {
          beforeEach('unset feed', async () => {
            await smartVault.setPriceFeeds(bases, quotes, [ZERO_ADDRESS, ZERO_ADDRESS])
            expect(await smartVault.getPriceFeed(base1.address, quote.address)).to.be.equal(ZERO_ADDRESS)
            expect(await smartVault.getPriceFeed(base2.address, quote.address)).to.be.equal(ZERO_ADDRESS)
          })

          itCanBeSet()
          itCanBeUnset()
        })
      })

      context('when the input is invalid', () => {
        it('reverts', async () => {
          await expect(smartVault.setPriceFeeds([base1.address], quotes, feeds)).to.be.revertedWith(
            'SET_FEEDS_INVALID_QUOTES_LENGTH'
          )

          await expect(smartVault.setPriceFeeds(bases, [quote.address], feeds)).to.be.revertedWith(
            'SET_FEEDS_INVALID_QUOTES_LENGTH'
          )

          await expect(smartVault.setPriceFeeds(bases, quotes, [feed1.address])).to.be.revertedWith(
            'SET_FEEDS_INVALID_FEEDS_LENGTH'
          )
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.setPriceFeeds(bases, quotes, feeds)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('call', () => {
    const value = fp(0.01)
    const data = '0xabcd'
    let target: Contract

    beforeEach('deploy target', async () => {
      target = await deploy('ContractMock')
    })

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const callRole = smartVault.interface.getSighash('call')
        await smartVault.connect(admin).authorize(admin.address, callRole)
        smartVault = smartVault.connect(admin)
      })

      context('when the call succeeds', () => {
        let callData: string

        beforeEach('encode call', async () => {
          callData = target.interface.encodeFunctionData('call')
        })

        it('calls the target contract', async () => {
          await admin.sendTransaction({ to: smartVault.address, value })
          const previousSmartVaultBalance = await ethers.provider.getBalance(smartVault.address)
          const previousTargetBalance = await ethers.provider.getBalance(target.address)

          const tx = await smartVault.call(target.address, callData, value, data)
          await assertEvent(tx, 'Call', { target, value, callData, data })
          await assertIndirectEvent(tx, target.interface, 'Received', { sender: smartVault, value })

          const currentSmartVaultBalance = await ethers.provider.getBalance(smartVault.address)
          expect(currentSmartVaultBalance).to.be.equal(previousSmartVaultBalance.sub(value))

          const currentTargetBalance = await ethers.provider.getBalance(target.address)
          expect(currentTargetBalance).to.be.equal(previousTargetBalance.add(value))
        })
      })

      context('when the call does not succeeds', () => {
        const callData = '0xabcdef12' // random

        it('reverts', async () => {
          await admin.sendTransaction({ to: smartVault.address, value })
          await expect(smartVault.call(target.address, callData, value, data)).to.be.revertedWith(
            'SMART_VAULT_ARBITRARY_CALL_FAIL'
          )
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.call(target.address, '0x', value, data)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
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
        const collectRole = smartVault.interface.getSighash('collect')
        await smartVault.connect(admin).authorize(admin.address, collectRole)
        smartVault = smartVault.connect(admin)
      })

      context('when the smart vault has enough allowance', () => {
        beforeEach('allow tokens', async () => {
          await token.mint(from.address, amount)
          await token.connect(from).approve(smartVault.address, amount)
        })

        it('transfers the tokens to the smart vault', async () => {
          const previousHolderBalance = await token.balanceOf(from.address)
          const previousSmartVaultBalance = await token.balanceOf(smartVault.address)

          await smartVault.collect(token.address, from.address, amount, data)

          const currentHolderBalance = await token.balanceOf(from.address)
          expect(currentHolderBalance).to.be.equal(previousHolderBalance.sub(amount))

          const currentSmartVaultBalance = await token.balanceOf(smartVault.address)
          expect(currentSmartVaultBalance).to.be.equal(previousSmartVaultBalance.add(amount))
        })

        it('emits an event', async () => {
          const tx = await smartVault.collect(token.address, from.address, amount, data)

          await assertEvent(tx, 'Collect', { token, from, collected: amount, data })
        })
      })

      context('when the smart vault does not have enough allowance', () => {
        beforeEach('allow tokens', async () => {
          await token.mint(admin.address, amount)
          await token.connect(admin).approve(smartVault.address, amount.sub(1))
        })

        it('reverts', async () => {
          await expect(smartVault.collect(token.address, from.address, amount, data)).to.be.revertedWith(
            'ERC20: insufficient allowance'
          )
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.collect(token.address, from.address, amount, data)).to.be.revertedWith(
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
        const withdrawRole = smartVault.interface.getSighash('withdraw')
        await smartVault.connect(admin).authorize(admin.address, withdrawRole)
        smartVault = smartVault.connect(admin)
      })

      context('when withdrawing erc20 tokens', async () => {
        let token: Contract

        before('deploy token', async () => {
          token = await deploy('TokenMock', ['USDC'])
        })

        context('when the smart vault has enough balance', async () => {
          beforeEach('mint tokens', async () => {
            await token.mint(smartVault.address, amount)
          })

          context('without withdraw fees', async () => {
            it('transfers the tokens to the recipient', async () => {
              const previousSmartVaultBalance = await token.balanceOf(smartVault.address)
              const previousRecipientBalance = await token.balanceOf(other.address)

              await smartVault.withdraw(token.address, amount, other.address, data)

              const currentSmartVaultBalance = await token.balanceOf(smartVault.address)
              expect(currentSmartVaultBalance).to.be.equal(previousSmartVaultBalance.sub(amount))

              const currentRecipientBalance = await token.balanceOf(other.address)
              expect(currentRecipientBalance).to.be.equal(previousRecipientBalance.add(amount))
            })

            it('emits an event', async () => {
              const tx = await smartVault.withdraw(token.address, amount, other.address, data)

              await assertEvent(tx, 'Withdraw', { token, withdrawn: amount, recipient: other, fee: 0, data })
            })
          })

          context('with withdraw fees', async () => {
            const withdrawFee = fp(0.01)
            const withdrawFeeAmount = amount.mul(withdrawFee).div(fp(1))

            beforeEach('authorize', async () => {
              const setWithdrawFeeRole = smartVault.interface.getSighash('setWithdrawFee')
              await smartVault.connect(admin).authorize(admin.address, setWithdrawFeeRole)
            })

            const itWithdrawsCorrectly = (expectedChargedFees: BigNumber) => {
              const amountAfterFees = amount.sub(expectedChargedFees)

              it('transfers the tokens to the recipient', async () => {
                const previousSmartVaultBalance = await token.balanceOf(smartVault.address)
                const previousRecipientBalance = await token.balanceOf(other.address)
                const previousFeeCollectorBalance = await token.balanceOf(feeCollector.address)

                await smartVault.withdraw(token.address, amount, other.address, data)

                const currentSmartVaultBalance = await token.balanceOf(smartVault.address)
                expect(currentSmartVaultBalance).to.be.equal(previousSmartVaultBalance.sub(amount))

                const currentRecipientBalance = await token.balanceOf(other.address)
                expect(currentRecipientBalance).to.be.equal(previousRecipientBalance.add(amountAfterFees))

                const currentFeeCollectorBalance = await token.balanceOf(feeCollector.address)
                expect(currentFeeCollectorBalance).to.be.equal(previousFeeCollectorBalance.add(expectedChargedFees))
              })

              it('emits an event', async () => {
                const tx = await smartVault.withdraw(token.address, amount, other.address, data)

                await assertEvent(tx, 'Withdraw', {
                  token,
                  withdrawn: amountAfterFees,
                  recipient: other,
                  fee: expectedChargedFees,
                  data,
                })
              })
            }

            context('without cap', async () => {
              beforeEach('set withdraw fee', async () => {
                await smartVault.connect(admin).setWithdrawFee(withdrawFee, 0, ZERO_ADDRESS, 0)
              })

              itWithdrawsCorrectly(withdrawFeeAmount)

              it('does not update the total charged fees', async () => {
                const previousData = await smartVault.withdrawFee()

                await smartVault.withdraw(token.address, amount, other.address, data)

                const currentData = await smartVault.withdrawFee()
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
                await smartVault.connect(admin).setWithdrawFee(withdrawFee, cap, capToken.address, period)
                periodStartTime = await currentTimestamp()
              })

              context('when the cap period has not been reached', async () => {
                itWithdrawsCorrectly(withdrawFeeAmount)

                it('updates the total charged fees', async () => {
                  const previousData = await smartVault.withdrawFee()

                  await smartVault.withdraw(token.address, amount, other.address, data)

                  const currentData = await smartVault.withdrawFee()
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
                  await token.mint(smartVault.address, amount.mul(3).div(4))
                  await smartVault.withdraw(token.address, amount.mul(3).div(4), other.address, data)
                })

                context('within the current cap period', async () => {
                  const expectedChargedFees = withdrawFeeAmount.div(4) // already accrued 3/4 of it

                  itWithdrawsCorrectly(expectedChargedFees)

                  it('updates the total charged fees', async () => {
                    const previousData = await smartVault.withdrawFee()

                    await smartVault.withdraw(token.address, amount, other.address, data)

                    const currentData = await smartVault.withdrawFee()
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
                    const previousData = await smartVault.withdrawFee()

                    await smartVault.withdraw(token.address, amount, other.address, data)

                    const currentData = await smartVault.withdrawFee()
                    expect(currentData.pct).to.be.equal(previousData.pct)
                    expect(currentData.cap).to.be.equal(previousData.cap)
                    expect(currentData.token).to.be.equal(previousData.token)
                    expect(currentData.period).to.be.equal(previousData.period)
                    expect(currentData.totalCharged).to.be.equal(withdrawFeeAmount.mul(capTokenRate))
                    expect(currentData.nextResetTime).to.be.equal((await currentTimestamp()).add(period))
                  })
                })
              })
            })
          })
        })

        context('when the smart vault does not have enough balance', async () => {
          it('reverts', async () => {
            await expect(smartVault.withdraw(token.address, amount, other.address, data)).to.be.revertedWith(
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

        context('when the smart vault has enough balance', async () => {
          beforeEach('deposit native tokens', async () => {
            await admin.sendTransaction({ to: smartVault.address, value: amount })
          })

          context('without withdraw fees', async () => {
            it('transfers the tokens to the recipient', async () => {
              const previousSmartVaultBalance = await ethers.provider.getBalance(smartVault.address)
              const previousRecipientBalance = await ethers.provider.getBalance(other.address)

              await smartVault.withdraw(token, amount, other.address, data)

              const currentSmartVaultBalance = await ethers.provider.getBalance(smartVault.address)
              expect(currentSmartVaultBalance).to.be.equal(previousSmartVaultBalance.sub(amount))

              const currentRecipientBalance = await ethers.provider.getBalance(other.address)
              expect(currentRecipientBalance).to.be.equal(previousRecipientBalance.add(amount))
            })

            it('emits an event', async () => {
              const tx = await smartVault.withdraw(token, amount, other.address, data)

              await assertEvent(tx, 'Withdraw', { token, withdrawn: amount, recipient: other, fee: 0, data })
            })
          })

          context('with withdraw fees', async () => {
            const withdrawFee = fp(0.01)
            const withdrawFeeAmount = amount.mul(withdrawFee).div(fp(1))

            beforeEach('authorize', async () => {
              const setWithdrawFeeRole = smartVault.interface.getSighash('setWithdrawFee')
              await smartVault.connect(admin).authorize(admin.address, setWithdrawFeeRole)
            })

            const itWithdrawsCorrectly = (expectedChargedFees: BigNumber) => {
              const amountAfterFees = amount.sub(expectedChargedFees)

              it('transfers the tokens to the recipient', async () => {
                const previousSmartVaultBalance = await ethers.provider.getBalance(smartVault.address)
                const previousRecipientBalance = await ethers.provider.getBalance(other.address)
                const previousFeeCollectorBalance = await ethers.provider.getBalance(feeCollector.address)

                await smartVault.withdraw(token, amount, other.address, data)

                const currentSmartVaultBalance = await ethers.provider.getBalance(smartVault.address)
                expect(currentSmartVaultBalance).to.be.equal(previousSmartVaultBalance.sub(amount))

                const currentRecipientBalance = await ethers.provider.getBalance(other.address)
                expect(currentRecipientBalance).to.be.equal(previousRecipientBalance.add(amountAfterFees))

                const currentFeeCollectorBalance = await ethers.provider.getBalance(feeCollector.address)
                expect(currentFeeCollectorBalance).to.be.equal(previousFeeCollectorBalance.add(expectedChargedFees))
              })

              it('emits an event', async () => {
                const tx = await smartVault.withdraw(token, amount, other.address, data)

                await assertEvent(tx, 'Withdraw', {
                  token,
                  withdrawn: amountAfterFees,
                  recipient: other,
                  fee: expectedChargedFees,
                  data,
                })
              })
            }

            context('without cap', async () => {
              beforeEach('set withdraw fee', async () => {
                await smartVault.connect(admin).setWithdrawFee(withdrawFee, 0, ZERO_ADDRESS, 0)
              })

              itWithdrawsCorrectly(withdrawFeeAmount)

              it('does not update the total charged fees', async () => {
                const previousData = await smartVault.withdrawFee()

                await smartVault.withdraw(token, amount, other.address, data)

                const currentData = await smartVault.withdrawFee()
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
                await smartVault.connect(admin).setWithdrawFee(withdrawFee, cap, capToken.address, period)
                periodStartTime = await currentTimestamp()
              })

              context('when the cap period has not been reached', async () => {
                itWithdrawsCorrectly(withdrawFeeAmount)

                it('updates the total charged fees', async () => {
                  const previousData = await smartVault.withdrawFee()

                  await smartVault.withdraw(token, amount, other.address, data)

                  const currentData = await smartVault.withdrawFee()
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
                  await admin.sendTransaction({ to: smartVault.address, value: amount.mul(3).div(4) })
                  await smartVault.withdraw(token, amount.mul(3).div(4), other.address, data)
                })

                context('within the current cap period', async () => {
                  const expectedChargedFees = withdrawFeeAmount.div(4) // already accrued 3/4 of it

                  itWithdrawsCorrectly(expectedChargedFees)

                  it('updates the total charged fees', async () => {
                    const previousData = await smartVault.withdrawFee()

                    await smartVault.withdraw(token, amount, other.address, data)

                    const currentData = await smartVault.withdrawFee()
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
                    const previousData = await smartVault.withdrawFee()

                    await smartVault.withdraw(token, amount, other.address, data)

                    const currentData = await smartVault.withdrawFee()
                    expect(currentData.pct).to.be.equal(previousData.pct)
                    expect(currentData.cap).to.be.equal(previousData.cap)
                    expect(currentData.token).to.be.equal(previousData.token)
                    expect(currentData.period).to.be.equal(previousData.period)
                    expect(currentData.totalCharged).to.be.equal(withdrawFeeAmount.mul(capTokenRate))
                    expect(currentData.nextResetTime).to.be.equal((await currentTimestamp()).add(period))
                  })
                })
              })
            })
          })
        })

        context('when the smart vault does not have enough balance', async () => {
          it('reverts', async () => {
            await expect(smartVault.withdraw(token, amount, other.address, data)).to.be.revertedWith(
              'Address: insufficient balance'
            )
          })
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.withdraw(ZERO_ADDRESS, 0, other.address, '0x')).to.be.revertedWith(
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
        const wrapRole = smartVault.interface.getSighash('wrap')
        await smartVault.connect(admin).authorize(admin.address, wrapRole)
        smartVault = smartVault.connect(admin)
      })

      context('when the smart vault has enough wrapped native tokens', () => {
        beforeEach('fund smart vault', async () => {
          await admin.sendTransaction({ to: smartVault.address, value: amount.mul(2) })
        })

        it('wraps the requested amount', async () => {
          const previousNativeBalance = await ethers.provider.getBalance(smartVault.address)
          const previousWrappedBalance = await wrappedNativeToken.balanceOf(smartVault.address)

          await smartVault.wrap(amount, data)

          const currentNativeBalance = await ethers.provider.getBalance(smartVault.address)
          expect(currentNativeBalance).to.be.equal(previousNativeBalance.sub(amount))

          const currentWrappedBalance = await wrappedNativeToken.balanceOf(smartVault.address)
          expect(currentWrappedBalance).to.be.equal(previousWrappedBalance.add(amount))
        })

        it('emits an event', async () => {
          const tx = await smartVault.wrap(amount, data)
          await assertEvent(tx, 'Wrap', { wrapped: amount, data })
        })
      })

      context('when the smart vault does not have enough native tokens', () => {
        it('reverts', async () => {
          await expect(smartVault.wrap(amount, data)).to.be.revertedWith('WRAP_INSUFFICIENT_AMOUNT')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.wrap(amount, data)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('unwrap', () => {
    const amount = fp(1)
    const data = '0xabcdef'

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const unwrapRole = smartVault.interface.getSighash('unwrap')
        await smartVault.connect(admin).authorize(admin.address, unwrapRole)
        smartVault = smartVault.connect(admin)
      })

      context('when the smart vault has enough wrapped native tokens', () => {
        beforeEach('wrap tokens', async () => {
          await admin.sendTransaction({ to: smartVault.address, value: amount.mul(2) })
          const wrapRole = smartVault.interface.getSighash('wrap')
          await smartVault.connect(admin).authorize(admin.address, wrapRole)
          await smartVault.wrap(amount.mul(2), data)
        })

        it('unwraps the requested amount', async () => {
          const previousNativeBalance = await ethers.provider.getBalance(smartVault.address)
          const previousWrappedBalance = await wrappedNativeToken.balanceOf(smartVault.address)

          await smartVault.unwrap(amount, data)

          const currentNativeBalance = await ethers.provider.getBalance(smartVault.address)
          expect(currentNativeBalance).to.be.equal(previousNativeBalance.add(amount))

          const currentWrappedBalance = await wrappedNativeToken.balanceOf(smartVault.address)
          expect(currentWrappedBalance).to.be.equal(previousWrappedBalance.sub(amount))
        })

        it('emits an event', async () => {
          const tx = await smartVault.unwrap(amount, data)
          await assertEvent(tx, 'Unwrap', { unwrapped: amount, data })
        })
      })

      context('when the smart vault does not have enough wrapped native tokens', () => {
        it('reverts', async () => {
          await expect(smartVault.unwrap(amount, data)).to.be.revertedWith('WNT_NOT_ENOUGH_BALANCE')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.unwrap(amount, data)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('claim', () => {
    const amount = fp(5)
    const data = ethers.utils.defaultAbiCoder.encode(['uint256'], [amount])

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const claimRole = smartVault.interface.getSighash('claim')
        await smartVault.connect(admin).authorize(admin.address, claimRole)
        smartVault = smartVault.connect(admin)
      })

      context('when the strategy is allowed', () => {
        let rewardToken: Contract

        beforeEach('allow strategy', async () => {
          await smartVault.connect(admin).setStrategy(strategy.address, true)
          rewardToken = await instanceAt('IERC20', await strategy.rewardToken())
        })

        it('receives the rewards', async () => {
          const previousBalance = await rewardToken.balanceOf(smartVault.address)

          await smartVault.claim(strategy.address, data)

          const currentBalance = await rewardToken.balanceOf(smartVault.address)
          expect(currentBalance).to.be.equal(previousBalance.add(amount))
        })

        it('emits an event', async () => {
          const tx = await smartVault.claim(strategy.address, data)

          await assertEvent(tx, 'Claim', { strategy, tokens: [rewardToken.address], amounts: [amount] })
        })
      })

      context('when the strategy is not allowed', () => {
        beforeEach('disallow strategy', async () => {
          await smartVault.connect(admin).setStrategy(strategy.address, false)
        })

        it('reverts', async () => {
          await expect(smartVault.claim(strategy.address, data)).to.be.revertedWith('STRATEGY_NOT_ALLOWED')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.claim(strategy.address, data)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('join', () => {
    let token: Contract, lpt: Contract

    const amount = fp(200)
    const data = '0xabcdef'

    beforeEach('load tokens', async () => {
      lpt = await instanceAt('TokenMock', await strategy.lpt())
      token = await instanceAt('TokenMock', await strategy.token())
    })

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const joinRole = smartVault.interface.getSighash('join')
        await smartVault.connect(admin).authorize(admin.address, joinRole)
        smartVault = smartVault.connect(admin)
      })

      context('when the slippage is valid', async () => {
        const slippage = fp(0.01)

        context('when the strategy is allowed', () => {
          beforeEach('allow strategy', async () => {
            await smartVault.connect(admin).setStrategy(strategy.address, true)
          })

          context('when the smart vault has enough balance', async () => {
            beforeEach('mint tokens', async () => {
              await token.mint(smartVault.address, amount)
            })

            it('receives lp tokens in exchange of strategy tokens', async () => {
              const previousLptBalance = await lpt.balanceOf(smartVault.address)
              const previousTokenBalance = await token.balanceOf(smartVault.address)

              await smartVault.join(strategy.address, [token.address], [amount], slippage, data)

              const currentLptBalance = await lpt.balanceOf(smartVault.address)
              expect(currentLptBalance).to.be.equal(previousLptBalance.add(amount))

              const currentTokenBalance = await token.balanceOf(smartVault.address)
              expect(currentTokenBalance).to.be.equal(previousTokenBalance.sub(amount))
            })

            it('emits an event', async () => {
              const tx = await smartVault.join(strategy.address, [token.address], [amount], slippage, data)

              await assertEvent(tx, 'Join', {
                strategy,
                tokensIn: [token.address],
                amountsIn: [amount],
                tokensOut: [lpt.address],
                amountsOut: [amount],
                slippage,
                data,
              })
            })
          })

          context('when the smart vault does not have enough tokens', async () => {
            it('reverts', async () => {
              await expect(
                smartVault.join(strategy.address, [token.address], [amount], slippage, data)
              ).to.be.revertedWith('exceeds balance')
            })
          })
        })

        context('when the strategy is not allowed', () => {
          beforeEach('disallow strategy', async () => {
            await smartVault.connect(admin).setStrategy(strategy.address, false)
          })

          it('reverts', async () => {
            await expect(
              smartVault.join(strategy.address, [token.address], [amount], slippage, data)
            ).to.be.revertedWith('STRATEGY_NOT_ALLOWED')
          })
        })
      })

      context('when the slippage is invalid', async () => {
        const slippage = fp(1.01)

        it('reverts', async () => {
          await expect(smartVault.join(strategy.address, [token.address], [amount], slippage, data)).to.be.revertedWith(
            'JOIN_SLIPPAGE_ABOVE_ONE'
          )
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.join(strategy.address, [token.address], [amount], 0, data)).to.be.revertedWith(
          'AUTH_SENDER_NOT_ALLOWED'
        )
      })
    })
  })

  describe('exit', () => {
    let token: Contract, lpt: Contract

    const data = '0xabcdef'

    beforeEach('load tokens', async () => {
      lpt = await instanceAt('TokenMock', await strategy.lpt())
      token = await instanceAt('TokenMock', await strategy.token())
    })

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const exitRole = smartVault.interface.getSighash('exit')
        await smartVault.connect(admin).authorize(admin.address, exitRole)
        smartVault = smartVault.connect(admin)
      })

      context('when the smart vault has joined before', async () => {
        const joinAmount = fp(150)

        beforeEach('join strategy', async () => {
          const joinRole = smartVault.interface.getSighash('join')
          await smartVault.connect(admin).authorize(admin.address, joinRole)
          await token.mint(smartVault.address, joinAmount)
          await smartVault.join(strategy.address, [token.address], [joinAmount], 0, data)
        })

        context('when the slippage is valid', async () => {
          const slippage = fp(0.01)

          context('when the strategy is allowed', () => {
            beforeEach('allow strategy', async () => {
              await smartVault.connect(admin).setStrategy(strategy.address, true)
            })

            async function computeExpectedAmountOut(ratio: BigNumber): Promise<BigNumber> {
              const currentValue = await strategy.lastValue(smartVault.address)
              const exitValue = currentValue.mul(ratio).div(fp(1))
              const valueRate = await strategy.valueRate()
              return exitValue.mul(valueRate).div(fp(1))
            }

            async function computeInvestedValueAfterExit(ratio: BigNumber): Promise<BigNumber> {
              const investedValue = await smartVault.investedValue(strategy.address)
              const currentValue = await strategy.lastValue(smartVault.address)
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
                const previousInvestedValue = await smartVault.investedValue(strategy.address)

                const exitAmount = (await lpt.balanceOf(smartVault.address)).mul(ratio).div(fp(1))
                await smartVault.exit(strategy.address, [lpt.address], [exitAmount], slippage, data)

                const currentInvestedValue = await smartVault.investedValue(strategy.address)
                expect(currentInvestedValue).to.be.equal(previousInvestedValue)
              })
            }

            const itDecreasesTheInvestedValue = (ratio: BigNumber) => {
              it('decreases the invested value', async () => {
                const expectedInvestedValue = await computeInvestedValueAfterExit(ratio)

                const exitAmount = (await lpt.balanceOf(smartVault.address)).mul(ratio).div(fp(1))
                await smartVault.exit(strategy.address, [lpt.address], [exitAmount], slippage, data)

                const currentInvestmentValue = await smartVault.investedValue(strategy.address)
                expect(currentInvestmentValue).to.be.equal(expectedInvestedValue)
              })
            }

            const itDoesNotPayPerformanceFees = (ratio: BigNumber) => {
              it('does not pay performance fees', async () => {
                const previousBalance = await token.balanceOf(feeCollector.address)

                const exitAmount = (await lpt.balanceOf(smartVault.address)).mul(ratio).div(fp(1))
                await smartVault.exit(strategy.address, [lpt.address], [exitAmount], slippage, data)

                const currentBalance = await token.balanceOf(feeCollector.address)
                expect(currentBalance).to.be.equal(previousBalance)
              })
            }

            context('with performance fee', async () => {
              const performanceFee = fp(0.02)

              beforeEach('set performance fee', async () => {
                const setPerformanceFeeRole = smartVault.interface.getSighash('setPerformanceFee')
                await smartVault.connect(admin).authorize(admin.address, setPerformanceFeeRole)
                await smartVault.connect(admin).setPerformanceFee(performanceFee, fp(1000), token.address, MONTH)
              })

              async function computePerformanceFeeAmount(ratio: BigNumber): Promise<BigNumber> {
                const investedValue = await smartVault.investedValue(strategy.address)
                const currentValue = await strategy.lastValue(smartVault.address)
                const valueGains = currentValue.gt(investedValue) ? currentValue.sub(investedValue) : bn(0)
                if (valueGains.eq(0)) return bn(0)

                const exitValue = currentValue.mul(ratio).div(fp(1))
                const taxableValue = exitValue.gt(valueGains) ? valueGains : exitValue

                const valueRate = await strategy.valueRate()
                const taxableAmount = taxableValue.mul(valueRate).div(fp(1))
                return taxableAmount.mul(performanceFee).div(fp(1))
              }

              const itTransfersTheTokensToTheSmartVault = (ratio: BigNumber) => {
                it('receives strategy tokens in exchange of lp tokens', async () => {
                  const expectedAmountOut = await computeExpectedAmountOut(ratio)
                  const performanceFeeAmount = await computePerformanceFeeAmount(ratio)
                  const expectedAmountOutAfterFees = expectedAmountOut.sub(performanceFeeAmount)
                  const previousLptBalance = await lpt.balanceOf(smartVault.address)
                  const previousTokenBalance = await token.balanceOf(smartVault.address)

                  const exitAmount = previousLptBalance.mul(ratio).div(fp(1))
                  await smartVault.exit(strategy.address, [lpt.address], [exitAmount], slippage, data)

                  const currentTokenBalance = await token.balanceOf(smartVault.address)
                  const expectedTokenBalance = previousTokenBalance.add(expectedAmountOutAfterFees)
                  expect(currentTokenBalance).to.be.at.least(expectedTokenBalance.sub(1))
                  expect(currentTokenBalance).to.be.at.most(expectedTokenBalance.add(1))

                  const currentLptBalance = await lpt.balanceOf(smartVault.address)
                  expect(currentLptBalance).to.be.equal(previousLptBalance.sub(exitAmount))
                })

                it('emits an event', async () => {
                  const expectedAmountOut = await computeExpectedAmountOut(ratio)
                  const performanceFeeAmount = await computePerformanceFeeAmount(ratio)
                  const expectedAmountOutAfterFees = expectedAmountOut.sub(performanceFeeAmount)

                  const exitAmount = (await lpt.balanceOf(smartVault.address)).mul(ratio).div(fp(1))
                  const tx = await smartVault.exit(strategy.address, [lpt.address], [exitAmount], slippage, data)

                  await assertEvent(tx, 'Exit', {
                    strategy,
                    tokensIn: [lpt.address],
                    amountsIn: [exitAmount],
                    tokensOut: [token.address],
                    amountsOut: [expectedAmountOutAfterFees],
                    value: expectedAmountOut, // rate 1
                    fees: [performanceFeeAmount],
                  })
                })
              }

              const itPaysPerformanceFees = (ratio: BigNumber) => {
                it('pays performance fees to the fee collector', async () => {
                  const previousBalance = await token.balanceOf(feeCollector.address)
                  const expectedPerformanceFeeAmount = await computePerformanceFeeAmount(ratio)

                  const exitAmount = (await lpt.balanceOf(smartVault.address)).mul(ratio).div(fp(1))
                  await smartVault.exit(strategy.address, [lpt.address], [exitAmount], slippage, data)

                  const currentBalance = await token.balanceOf(feeCollector.address)
                  const expectedBalance = previousBalance.add(expectedPerformanceFeeAmount)
                  expect(currentBalance).to.be.at.least(expectedBalance.sub(1))
                  expect(currentBalance).to.be.at.most(expectedBalance.add(1))
                })

                it('updates the total charged fees', async () => {
                  const previousData = await smartVault.performanceFee()
                  const expectedPerformanceFeeAmount = await computePerformanceFeeAmount(ratio)

                  const exitAmount = (await lpt.balanceOf(smartVault.address)).mul(ratio).div(fp(1))
                  await smartVault.exit(strategy.address, [lpt.address], [exitAmount], slippage, data)

                  const currentData = await smartVault.performanceFee()
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

                  itTransfersTheTokensToTheSmartVault(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })

                context('when withdraws all', async () => {
                  const ratio = fp(1)

                  itTransfersTheTokensToTheSmartVault(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })
              })

              context('when the strategy reports some gains (2x)', async () => {
                beforeEach('mock gains', async () => {
                  await strategy.mockGains(smartVault.address, 2)
                })

                context('when withdraws only gains', async () => {
                  const ratio = fp(0.5)

                  itTransfersTheTokensToTheSmartVault(ratio)
                  itDoesNotAffectTheInvestedValue(ratio)
                  itPaysPerformanceFees(ratio)
                })

                context('when withdraws more than gains', async () => {
                  const ratio = fp(0.75)

                  itTransfersTheTokensToTheSmartVault(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itPaysPerformanceFees(ratio)
                })

                context('when withdraws all', async () => {
                  const ratio = fp(1)

                  itTransfersTheTokensToTheSmartVault(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itPaysPerformanceFees(ratio)
                })
              })

              context('when the strategy reports losses (0.5x)', async () => {
                beforeEach('mock losses', async () => {
                  await strategy.mockLosses(smartVault.address, 2)
                })

                context('when withdraws half', async () => {
                  const ratio = fp(0.5)

                  itTransfersTheTokensToTheSmartVault(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })

                context('when withdraws all', async () => {
                  const ratio = fp(1)

                  itTransfersTheTokensToTheSmartVault(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })
              })
            })

            context('without performance fee', async () => {
              const itTransfersTheTokensToTheSmartVault = (ratio: BigNumber) => {
                it('receives strategy tokens in exchange of lp tokens', async () => {
                  const expectedAmountOut = await computeExpectedAmountOut(ratio)
                  const previousLptBalance = await lpt.balanceOf(smartVault.address)
                  const previousTokenBalance = await token.balanceOf(smartVault.address)

                  const exitAmount = previousLptBalance.mul(ratio).div(fp(1))
                  await smartVault.exit(strategy.address, [lpt.address], [exitAmount], slippage, data)

                  const currentTokenBalance = await token.balanceOf(smartVault.address)
                  const expectedTokenBalance = previousTokenBalance.add(expectedAmountOut)
                  expect(currentTokenBalance).to.be.at.least(expectedTokenBalance.sub(1))
                  expect(currentTokenBalance).to.be.at.most(expectedTokenBalance.add(1))

                  const currentLptBalance = await lpt.balanceOf(smartVault.address)
                  expect(currentLptBalance).to.be.equal(previousLptBalance.sub(exitAmount))
                })

                it('emits an event', async () => {
                  const expectedAmountOut = await computeExpectedAmountOut(ratio)

                  const exitAmount = (await lpt.balanceOf(smartVault.address)).mul(ratio).div(fp(1))
                  const tx = await smartVault.exit(strategy.address, [lpt.address], [exitAmount], slippage, data)

                  await assertEvent(tx, 'Exit', {
                    strategy,
                    tokensIn: [lpt.address],
                    amountsIn: [exitAmount],
                    tokensOut: [token.address],
                    amountsOut: [expectedAmountOut],
                    value: expectedAmountOut, // rate 1
                    fees: [bn(0)],
                  })
                })
              }

              context('when the strategy is even', async () => {
                context('when withdraws half', async () => {
                  const ratio = fp(0.5)

                  itTransfersTheTokensToTheSmartVault(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })

                context('when withdraws all', async () => {
                  const ratio = fp(1)

                  itTransfersTheTokensToTheSmartVault(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })
              })

              context('when the strategy reports some gains (2x)', async () => {
                beforeEach('mock gains', async () => {
                  await strategy.mockGains(smartVault.address, 2)
                })

                context('when withdraws only gains', async () => {
                  const ratio = fp(0.5)

                  itTransfersTheTokensToTheSmartVault(ratio)
                  itDoesNotAffectTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })

                context('when withdraws more than gains', async () => {
                  const ratio = fp(0.75)

                  itTransfersTheTokensToTheSmartVault(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })

                context('when withdraws all', async () => {
                  const ratio = fp(1)

                  itTransfersTheTokensToTheSmartVault(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })
              })

              context('when the strategy reports losses (0.5x)', async () => {
                beforeEach('mock losses', async () => {
                  await strategy.mockLosses(smartVault.address, 2)
                })

                context('when withdraws half', async () => {
                  const ratio = fp(0.5)

                  itTransfersTheTokensToTheSmartVault(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })

                context('when withdraws all', async () => {
                  const ratio = fp(1)

                  itTransfersTheTokensToTheSmartVault(ratio)
                  itDecreasesTheInvestedValue(ratio)
                  itDoesNotPayPerformanceFees(ratio)
                })
              })
            })
          })

          context('when the strategy is not allowed', () => {
            beforeEach('disallow strategy', async () => {
              await smartVault.connect(admin).setStrategy(strategy.address, false)
            })

            it('reverts', async () => {
              await expect(smartVault.exit(strategy.address, [token.address], [0], slippage, data)).to.be.revertedWith(
                'STRATEGY_NOT_ALLOWED'
              )
            })
          })
        })

        context('when the slippage is invalid', async () => {
          const slippage = fp(1.01)

          it('reverts', async () => {
            await expect(smartVault.exit(strategy.address, [token.address], [0], slippage, data)).to.be.revertedWith(
              'EXIT_SLIPPAGE_ABOVE_ONE'
            )
          })
        })
      })

      context('when the smart vault has not joined before', async () => {
        it('reverts', async () => {
          await expect(smartVault.exit(strategy.address, [token.address], [0], 0, data)).to.be.revertedWith(
            'EXIT_NO_INVESTED_VALUE'
          )
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.exit(strategy.address, [token.address], [0], 0, data)).to.be.revertedWith(
          'AUTH_SENDER_NOT_ALLOWED'
        )
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
      let swapConnectorDex: string

      beforeEach('set sender', async () => {
        const swapRole = smartVault.interface.getSighash('swap')
        await smartVault.connect(admin).authorize(admin.address, swapRole)
        smartVault = smartVault.connect(admin)
      })

      beforeEach('load swap connector dex', async () => {
        swapConnectorDex = await swapConnector.dex()
      })

      const itSwapsAsExpected = (
        limitType: number,
        limitAmount: BigNumberish,
        expectedAmountOut: BigNumber,
        expectedMinAmountOut: BigNumber
      ) => {
        beforeEach('fund swap connector', async () => {
          await tokenOut.mint(swapConnectorDex, expectedAmountOut)
        })

        context('without swap fee', () => {
          it('transfers the token in to the dex', async () => {
            const previousSmartVaultBalance = await tokenIn.balanceOf(smartVault.address)
            const previousConnectorBalance = await tokenIn.balanceOf(swapConnectorDex)

            await smartVault.swap(source, tokenIn.address, tokenOut.address, amount, limitType, limitAmount, data)

            const currentSmartVaultBalance = await tokenIn.balanceOf(smartVault.address)
            expect(currentSmartVaultBalance).to.be.equal(previousSmartVaultBalance.sub(amount))

            const currentConnectorBalance = await tokenIn.balanceOf(swapConnectorDex)
            expect(currentConnectorBalance).to.be.equal(previousConnectorBalance.add(amount))
          })

          it('transfers the token out to the smart vault', async () => {
            const previousSmartVaultBalance = await tokenOut.balanceOf(smartVault.address)
            const previousConnectorBalance = await tokenOut.balanceOf(swapConnectorDex)

            await smartVault.swap(source, tokenIn.address, tokenOut.address, amount, limitType, limitAmount, data)

            const currentSmartVaultBalance = await tokenOut.balanceOf(smartVault.address)
            expect(currentSmartVaultBalance).to.be.equal(previousSmartVaultBalance.add(expectedAmountOut))

            const currentConnectorBalance = await tokenOut.balanceOf(swapConnectorDex)
            expect(currentConnectorBalance).to.be.equal(previousConnectorBalance.sub(expectedAmountOut))
          })

          it('emits an event', async () => {
            const tx = await smartVault.swap(
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
            const setSwapFeeRole = smartVault.interface.getSighash('setSwapFee')
            await smartVault.connect(admin).authorize(admin.address, setSwapFeeRole)
          })

          const itSwapsCorrectly = (expectedChargedFees: BigNumber) => {
            const expectedAmountOutAfterFees = expectedAmountOut.sub(expectedChargedFees)

            it('transfers the token in to the dex', async () => {
              const previousSmartVaultBalance = await tokenIn.balanceOf(smartVault.address)
              const previousConnectorBalance = await tokenIn.balanceOf(swapConnectorDex)
              const previousFeeCollectorBalance = await tokenIn.balanceOf(feeCollector.address)

              await smartVault.swap(source, tokenIn.address, tokenOut.address, amount, limitType, limitAmount, data)

              const currentSmartVaultBalance = await tokenIn.balanceOf(smartVault.address)
              expect(currentSmartVaultBalance).to.be.equal(previousSmartVaultBalance.sub(amount))

              const currentConnectorBalance = await tokenIn.balanceOf(swapConnectorDex)
              expect(currentConnectorBalance).to.be.equal(previousConnectorBalance.add(amount))

              const currentFeeCollectorBalance = await tokenIn.balanceOf(feeCollector.address)
              expect(currentFeeCollectorBalance).to.be.equal(previousFeeCollectorBalance)
            })

            it('transfers the token out to the smart vault', async () => {
              const previousSmartVaultBalance = await tokenOut.balanceOf(smartVault.address)
              const previousConnectorBalance = await tokenOut.balanceOf(swapConnectorDex)
              const previousFeeCollectorBalance = await tokenOut.balanceOf(feeCollector.address)

              await smartVault.swap(source, tokenIn.address, tokenOut.address, amount, limitType, limitAmount, data)

              const currentSmartVaultBalance = await tokenOut.balanceOf(smartVault.address)
              expect(currentSmartVaultBalance).to.be.equal(previousSmartVaultBalance.add(expectedAmountOutAfterFees))

              const currentConnectorBalance = await tokenOut.balanceOf(swapConnectorDex)
              expect(currentConnectorBalance).to.be.equal(previousConnectorBalance.sub(expectedAmountOut))

              const currentFeeCollectorBalance = await tokenOut.balanceOf(feeCollector.address)
              expect(currentFeeCollectorBalance).to.be.equal(previousFeeCollectorBalance.add(expectedChargedFees))
            })

            it('emits an event', async () => {
              const tx = await smartVault.swap(
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
              await smartVault.connect(admin).setSwapFee(swapFee, 0, ZERO_ADDRESS, 0)
            })

            itSwapsCorrectly(swapFeeAmount)

            it('does not update the total charged fees', async () => {
              const previousData = await smartVault.swapFee()

              await smartVault.swap(source, tokenIn.address, tokenOut.address, amount, limitType, limitAmount, data)

              const currentData = await smartVault.swapFee()
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
              await smartVault.connect(admin).setSwapFee(swapFee, cap, capToken.address, period)
              periodStartTime = await currentTimestamp()
            })

            context('when the cap period has not been reached', async () => {
              itSwapsCorrectly(swapFeeAmount)

              it('updates the total charged fees', async () => {
                const previousData = await smartVault.swapFee()

                await smartVault.swap(source, tokenIn.address, tokenOut.address, amount, limitType, limitAmount, data)

                const currentData = await smartVault.swapFee()
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
                await tokenIn.mint(smartVault.address, amount.mul(3).div(4))
                await tokenOut.mint(swapConnectorDex, expectedAmountOut.mul(3).div(4))

                const limit = limitType == SWAP_LIMIT.SLIPPAGE ? limitAmount : bn(limitAmount).mul(3).div(4)
                await smartVault.swap(
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
                  const previousData = await smartVault.swapFee()

                  await smartVault.swap(source, tokenIn.address, tokenOut.address, amount, limitType, limitAmount, data)

                  const currentData = await smartVault.swapFee()
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
                  const previousData = await smartVault.swapFee()

                  await smartVault.swap(source, tokenIn.address, tokenOut.address, amount, limitType, limitAmount, data)

                  const currentData = await smartVault.swapFee()
                  expect(currentData.pct).to.be.equal(previousData.pct)
                  expect(currentData.cap).to.be.equal(previousData.cap)
                  expect(currentData.token).to.be.equal(previousData.token)
                  expect(currentData.period).to.be.equal(previousData.period)
                  expect(currentData.totalCharged).to.be.equal(swapFeeAmount.mul(capTokenRate))
                  expect(currentData.nextResetTime).to.be.equal((await currentTimestamp()).add(period))
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

          context('when the smart vault has enough balance', async () => {
            beforeEach('mint tokens', async () => {
              await tokenIn.mint(smartVault.address, amount)
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
                  await tokenOut.mint(swapConnectorDex, amount.mul(SWAP_CONNECTOR_RATE).div(fp(1)))
                })

                it('reverts', async () => {
                  await expect(
                    smartVault.swap(source, tokenIn.address, tokenOut.address, amount, limitType, slippage, data)
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

          context('when the smart vault does not have enough balance', () => {
            it('reverts', async () => {
              await expect(
                smartVault.swap(source, tokenIn.address, tokenOut.address, amount, limitType, 0, data)
              ).to.be.revertedWith('ERC20: transfer amount exceeds balance')
            })
          })
        })

        context('when the given slippage is not valid', () => {
          const slippage = fp(1.01)

          it('reverts', async () => {
            await expect(
              smartVault.swap(source, tokenIn.address, tokenOut.address, amount, limitType, slippage, data)
            ).to.be.revertedWith('SLIPPAGE_ABOVE_ONE')
          })
        })
      })

      context('when using a min amount out limit', () => {
        const PRETENDED_RATE = fp(2)
        const limitType = SWAP_LIMIT.MIN_AMOUNT_OUT
        const minAmountOut = amount.mul(PRETENDED_RATE).div(fp(1))

        context('when the smart vault has enough balance', async () => {
          beforeEach('mint tokens', async () => {
            await tokenIn.mint(smartVault.address, amount)
          })

          context('when the swap connector provides a worse rate', () => {
            const SWAP_CONNECTOR_RATE = PRETENDED_RATE.sub(fp(0.5))

            beforeEach('mock rate and fund swap connector', async () => {
              await swapConnector.mockRate(SWAP_CONNECTOR_RATE)
              await tokenOut.mint(swapConnectorDex, amount.mul(SWAP_CONNECTOR_RATE).div(fp(1)))
            })

            it('reverts', async () => {
              await expect(
                smartVault.swap(source, tokenIn.address, tokenOut.address, amount, limitType, minAmountOut, data)
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

        context('when the smart vault does not have enough balance', () => {
          it('reverts', async () => {
            await expect(
              smartVault.swap(source, tokenIn.address, tokenOut.address, amount, limitType, minAmountOut, data)
            ).to.be.revertedWith('ERC20: transfer amount exceeds balance')
          })
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.swap(source, tokenIn.address, tokenOut.address, amount, 0, 0, data)).to.be.revertedWith(
          'AUTH_SENDER_NOT_ALLOWED'
        )
      })
    })
  })

  describe('bridge', () => {
    let token: Contract

    const source = 0
    const chainId = 0
    const amount = fp(500)
    const data = '0xabcdef'

    const BRIDGE_LIMIT = { SLIPPAGE: 0, MIN_AMOUNT_OUT: 1 }

    before('deploy tokens', async () => {
      token = await deploy('TokenMock', ['USDC'])
    })

    context('when the sender is authorized', () => {
      let bridge: string

      beforeEach('set sender', async () => {
        const bridgeRole = smartVault.interface.getSighash('bridge')
        await smartVault.connect(admin).authorize(admin.address, bridgeRole)
        smartVault = smartVault.connect(admin)
      })

      beforeEach('load bridge connector bridge', async () => {
        bridge = await bridgeConnector.bridgeMock()
      })

      const itBridgesAsExpected = (limitType: number, limitAmount: BigNumberish) => {
        context('without bridge fee', () => {
          const expectedMinAmount =
            limitType == BRIDGE_LIMIT.MIN_AMOUNT_OUT ? limitAmount : amount.sub(amount.mul(limitAmount).div(fp(1)))

          it('transfers the token to the bridge', async () => {
            const previousSmartVaultBalance = await token.balanceOf(smartVault.address)
            const previousConnectorBalance = await token.balanceOf(bridge)

            await smartVault.bridge(source, chainId, token.address, amount, limitType, limitAmount, data)

            const currentSmartVaultBalance = await token.balanceOf(smartVault.address)
            expect(currentSmartVaultBalance).to.be.equal(previousSmartVaultBalance.sub(amount))

            const currentConnectorBalance = await token.balanceOf(bridge)
            expect(currentConnectorBalance).to.be.equal(previousConnectorBalance.add(amount))
          })

          it('emits an event', async () => {
            const tx = await smartVault.bridge(source, chainId, token.address, amount, limitType, limitAmount, data)

            await assertEvent(tx, 'Bridge', {
              source,
              chainId,
              token,
              amountIn: amount,
              minAmountOut: expectedMinAmount,
              fee: 0,
              data,
            })
          })
        })

        context('with bridge fee', () => {
          const bridgeFee = fp(0.01)
          const bridgeFeeAmount = amount.mul(bridgeFee).div(fp(1))

          beforeEach('authorize', async () => {
            const setBridgeFeeRole = smartVault.interface.getSighash('setBridgeFee')
            await smartVault.connect(admin).authorize(admin.address, setBridgeFeeRole)
          })

          const itBridgesCorrectly = (expectedChargedFees: BigNumber) => {
            const expectedAmountIn = amount.sub(expectedChargedFees)
            const expectedMinAmount =
              limitType == BRIDGE_LIMIT.MIN_AMOUNT_OUT
                ? limitAmount
                : expectedAmountIn.sub(expectedAmountIn.mul(limitAmount).div(fp(1)))

            it('transfers the token to the bridge', async () => {
              const previousBridgeBalance = await token.balanceOf(bridge)
              const previousSmartVaultBalance = await token.balanceOf(smartVault.address)
              const previousFeeCollectorBalance = await token.balanceOf(feeCollector.address)

              await smartVault.bridge(source, chainId, token.address, amount, limitType, limitAmount, data)

              const currentSmartVaultBalance = await token.balanceOf(smartVault.address)
              expect(currentSmartVaultBalance).to.be.equal(previousSmartVaultBalance.sub(amount))

              const currentBridgeBalance = await token.balanceOf(bridge)
              expect(currentBridgeBalance).to.be.equal(previousBridgeBalance.add(expectedAmountIn))

              const currentFeeCollectorBalance = await token.balanceOf(feeCollector.address)
              expect(currentFeeCollectorBalance).to.be.equal(previousFeeCollectorBalance.add(expectedChargedFees))
            })

            it('emits an event', async () => {
              const tx = await smartVault.bridge(source, chainId, token.address, amount, limitType, limitAmount, data)

              await assertEvent(tx, 'Bridge', {
                source,
                chainId,
                token,
                amountIn: expectedAmountIn,
                minAmountOut: expectedMinAmount,
                fee: expectedChargedFees,
                data,
              })
            })
          }

          context('without cap', async () => {
            beforeEach('set bridge fee', async () => {
              await smartVault.connect(admin).setBridgeFee(bridgeFee, 0, ZERO_ADDRESS, 0)
            })

            itBridgesCorrectly(bridgeFeeAmount)

            it('does not update the total charged fees', async () => {
              const previousData = await smartVault.bridgeFee()

              await smartVault.bridge(source, chainId, token.address, amount, limitType, limitAmount, data)

              const currentData = await smartVault.bridgeFee()
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
            const cap = bridgeFeeAmount.mul(capTokenRate)

            let capToken: Contract
            let periodStartTime: BigNumber

            beforeEach('deploy cap token', async () => {
              capToken = await deploy('TokenMock', ['USDT'])
              await priceOracle.mockRate(token.address, capToken.address, fp(capTokenRate))
            })

            beforeEach('set bridge fee', async () => {
              await smartVault.connect(admin).setBridgeFee(bridgeFee, cap, capToken.address, period)
              periodStartTime = await currentTimestamp()
            })

            context('when the cap period has not been reached', async () => {
              itBridgesCorrectly(bridgeFeeAmount)

              it('updates the total charged fees', async () => {
                const previousData = await smartVault.bridgeFee()

                await smartVault.bridge(source, chainId, token.address, amount, limitType, limitAmount, data)

                const currentData = await smartVault.bridgeFee()
                expect(currentData.pct).to.be.equal(previousData.pct)
                expect(currentData.cap).to.be.equal(previousData.cap)
                expect(currentData.token).to.be.equal(previousData.token)
                expect(currentData.period).to.be.equal(previousData.period)
                expect(currentData.totalCharged).to.be.equal(bridgeFeeAmount.mul(capTokenRate))
                expect(currentData.nextResetTime).to.be.equal(periodStartTime.add(period))
              })
            })

            context('when the cap period has been reached', async () => {
              beforeEach('accrue some charged fees', async () => {
                await token.mint(smartVault.address, amount.mul(3).div(4))

                const limit = limitType == BRIDGE_LIMIT.SLIPPAGE ? limitAmount : bn(limitAmount).mul(3).div(4)
                await smartVault.bridge(source, chainId, token.address, amount.mul(3).div(4), limitType, limit, data)
              })

              context('within the current cap period', async () => {
                const expectedChargedFees = bridgeFeeAmount.div(4) // already accrued 3/4 of it

                itBridgesCorrectly(expectedChargedFees)

                it('updates the total charged fees', async () => {
                  const previousData = await smartVault.bridgeFee()

                  await smartVault.bridge(source, chainId, token.address, amount, limitType, limitAmount, data)

                  const currentData = await smartVault.bridgeFee()
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

                itBridgesCorrectly(bridgeFeeAmount)

                it('updates the total charged fees and the next reset time', async () => {
                  const previousData = await smartVault.bridgeFee()

                  await smartVault.bridge(source, chainId, token.address, amount, limitType, limitAmount, data)

                  const currentData = await smartVault.bridgeFee()
                  expect(currentData.pct).to.be.equal(previousData.pct)
                  expect(currentData.cap).to.be.equal(previousData.cap)
                  expect(currentData.token).to.be.equal(previousData.token)
                  expect(currentData.period).to.be.equal(previousData.period)
                  expect(currentData.totalCharged).to.be.equal(bridgeFeeAmount.mul(capTokenRate))
                  expect(currentData.nextResetTime).to.be.equal((await currentTimestamp()).add(period))
                })
              })
            })
          })
        })
      }

      context('when using a slippage limit', () => {
        const limit = BRIDGE_LIMIT.SLIPPAGE

        context('when the given slippage is valid', () => {
          const slippage = fp(0.02)

          context('when the smart vault has enough balance', () => {
            beforeEach('mint tokens', async () => {
              await token.mint(smartVault.address, amount)
            })

            itBridgesAsExpected(limit, slippage)
          })

          context('when the smart vault does not have enough balance', () => {
            it('reverts', async () => {
              await expect(
                smartVault.bridge(source, chainId, token.address, amount, limit, slippage, data)
              ).to.be.revertedWith('ERC20: transfer amount exceeds balance')
            })
          })
        })

        context('when the given slippage is not valid', () => {
          const slippage = fp(1.01)

          it('reverts', async () => {
            await expect(
              smartVault.bridge(source, chainId, token.address, amount, limit, slippage, data)
            ).to.be.revertedWith('SLIPPAGE_ABOVE_ONE')
          })
        })
      })

      context('when using a min amount out limit', () => {
        const limit = BRIDGE_LIMIT.MIN_AMOUNT_OUT
        const minAmountOut = amount.div(2)

        context('when the smart vault has enough balance', () => {
          beforeEach('mint tokens', async () => {
            await token.mint(smartVault.address, amount)
          })

          itBridgesAsExpected(limit, minAmountOut)
        })

        context('when the smart vault does not have enough balance', () => {
          it('reverts', async () => {
            await expect(
              smartVault.bridge(source, chainId, token.address, amount, limit, minAmountOut, data)
            ).to.be.revertedWith('ERC20: transfer amount exceeds balance')
          })
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        smartVault = smartVault.connect(other)
      })

      it('reverts', async () => {
        await expect(smartVault.bridge(source, chainId, token.address, amount, 0, 0, data)).to.be.revertedWith(
          'AUTH_SENDER_NOT_ALLOWED'
        )
      })
    })
  })
})
