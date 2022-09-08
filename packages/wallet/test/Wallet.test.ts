import { assertEvent, BigNumberish, bn, deploy, fp, getSigners, instanceAt, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
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
    strategy = await createClone(registry, admin, 'StrategyMock', [registry.address], [])
    priceOracle = await createClone(registry, admin, 'PriceOracleMock', [])
    swapConnector = await createClone(registry, admin, 'SwapConnectorMock', [])
    wallet = await createClone(
      registry,
      admin,
      'Wallet',
      [registry.address, wrappedNativeToken.address],
      [admin.address, strategy.address, priceOracle.address, swapConnector.address, feeCollector.address]
    )
  })

  describe('initialize', async () => {
    it('cannot be initialized twice', async () => {
      await expect(
        wallet.initialize(
          admin.address,
          strategy.address,
          priceOracle.address,
          swapConnector.address,
          feeCollector.address
        )
      ).to.be.revertedWith('Initializable: contract is already initialized')
    })

    it('its implementation is already initialized', async () => {
      const implementation = await instanceAt('Wallet', await registry.getImplementation(wallet.address))
      await expect(
        implementation.initialize(
          admin.address,
          strategy.address,
          priceOracle.address,
          swapConnector.address,
          feeCollector.address
        )
      ).to.be.revertedWith('Initializable: contract is already initialized')
    })

    it('is properly registered in the registry', async () => {
      const implementation = await registry.getImplementation(wallet.address)
      expect(await registry.isRegistered(await wallet.NAMESPACE(), implementation)).to.be.true
    })
  })

  describe('setPriceOracle', () => {
    let newOracle: Contract

    context('when the sender is authorized', async () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(admin)
      })

      context('when the implementation is registered', async () => {
        beforeEach('deploy implementation', async () => {
          newOracle = await createClone(registry, admin, 'PriceOracleMock', [])
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
          newOracle = await deploy('PriceOracleMock')
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
      beforeEach('set sender', () => {
        wallet = wallet.connect(admin)
      })

      context('when the implementation is registered', async () => {
        beforeEach('deploy implementation', async () => {
          newSwapConnector = await createClone(registry, admin, 'SwapConnectorMock', [])
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
          newSwapConnector = await deploy('SwapConnectorMock')
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
      beforeEach('set sender', () => {
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
      beforeEach('set sender', () => {
        wallet = wallet.connect(admin)
      })

      context('when the new fee is below one', async () => {
        const newWithdrawFee = fp(0.01)

        it('sets the withdraw fee', async () => {
          await wallet.setWithdrawFee(newWithdrawFee)

          const withdrawFee = await wallet.withdrawFee()
          expect(withdrawFee).to.be.equal(newWithdrawFee)
        })

        it('emits an event', async () => {
          const tx = await wallet.setWithdrawFee(newWithdrawFee)
          await assertEvent(tx, 'WithdrawFeeSet', { withdrawFee: newWithdrawFee })
        })
      })

      context('when the new fee is above one', async () => {
        const newWithdrawFee = fp(1.01)

        it('reverts', async () => {
          await expect(wallet.setWithdrawFee(newWithdrawFee)).to.be.revertedWith('WITHDRAW_FEE_ABOVE_ONE')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.setWithdrawFee(0)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setPerformanceFee', () => {
    context('when the sender is authorized', async () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(admin)
      })

      context('when the new fee is below one', async () => {
        const newPerformanceFee = fp(0.01)

        it('sets the performance fee', async () => {
          await wallet.setPerformanceFee(newPerformanceFee)

          const performanceFee = await wallet.performanceFee()
          expect(performanceFee).to.be.equal(newPerformanceFee)
        })

        it('emits an event', async () => {
          const tx = await wallet.setPerformanceFee(newPerformanceFee)
          await assertEvent(tx, 'PerformanceFeeSet', { performanceFee: newPerformanceFee })
        })
      })

      context('when the new fee is above one', async () => {
        const newPerformanceFee = fp(1.01)

        it('reverts', async () => {
          await expect(wallet.setPerformanceFee(newPerformanceFee)).to.be.revertedWith('PERFORMANCE_FEE_ABOVE_ONE')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.setPerformanceFee(0)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setSwapFee', () => {
    context('when the sender is authorized', async () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(admin)
      })

      context('when the new fee is below one', async () => {
        const newSwapFee = fp(0.01)

        it('sets the swap fee', async () => {
          await wallet.setSwapFee(newSwapFee)

          const swapFee = await wallet.swapFee()
          expect(swapFee).to.be.equal(newSwapFee)
        })

        it('emits an event', async () => {
          const tx = await wallet.setSwapFee(newSwapFee)
          await assertEvent(tx, 'SwapFeeSet', { swapFee: newSwapFee })
        })
      })

      context('when the new fee is above one', async () => {
        const newSwapFee = fp(1.01)

        it('reverts', async () => {
          await expect(wallet.setSwapFee(newSwapFee)).to.be.revertedWith('SWAP_FEE_ABOVE_ONE')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.setSwapFee(0)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
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
            const amountAfterFees = amount.sub(withdrawFeeAmount)

            beforeEach('set withdraw fee', async () => {
              await wallet.connect(admin).setWithdrawFee(withdrawFee)
            })

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
              expect(currentFeeCollectorBalance).to.be.equal(previousFeeCollectorBalance.add(withdrawFeeAmount))
            })

            it('emits an event', async () => {
              const tx = await wallet.withdraw(token.address, amount, other.address, data)

              await assertEvent(tx, 'Withdraw', {
                token,
                amount: amountAfterFees,
                recipient: other,
                fee: withdrawFeeAmount,
                data,
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
          token = await wallet.ETH()
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
            const amountAfterFees = amount.sub(withdrawFeeAmount)

            beforeEach('set withdraw fee', async () => {
              await wallet.connect(admin).setWithdrawFee(withdrawFee)
            })

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
              expect(currentFeeCollectorBalance).to.be.equal(previousFeeCollectorBalance.add(withdrawFeeAmount))
            })

            it('emits an event', async () => {
              const tx = await wallet.withdraw(token, amount, other.address, data)

              await assertEvent(tx, 'Withdraw', {
                token,
                amount: amountAfterFees,
                recipient: other,
                fee: withdrawFeeAmount,
                data,
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

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        wallet = wallet.connect(admin)
      })

      context('when the wallet has enough wrapped native tokens', () => {
        beforeEach('fund wallet', async () => {
          await admin.sendTransaction({ to: wallet.address, value: amount.mul(2) })
        })

        it('wraps the requested amount', async () => {
          const previousNativeBalance = await ethers.provider.getBalance(wallet.address)
          const previousWrappedBalance = await wrappedNativeToken.balanceOf(wallet.address)

          await wallet.wrap(amount)

          const currentNativeBalance = await ethers.provider.getBalance(wallet.address)
          expect(currentNativeBalance).to.be.equal(previousNativeBalance.sub(amount))

          const currentWrappedBalance = await wrappedNativeToken.balanceOf(wallet.address)
          expect(currentWrappedBalance).to.be.equal(previousWrappedBalance.add(amount))
        })

        it('emits an event', async () => {
          const tx = await wallet.wrap(amount)
          await assertEvent(tx, 'Wrap', { amount })
        })
      })

      context('when the wallet does not have enough native tokens', () => {
        it('reverts', async () => {
          await expect(wallet.wrap(amount)).to.be.revertedWith('WRAP_INSUFFICIENT_AMOUNT')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.wrap(amount)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('unwrap', () => {
    const amount = fp(1)

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        wallet = wallet.connect(admin)
      })

      context('when the wallet has enough wrapped native tokens', () => {
        beforeEach('wrap tokens', async () => {
          await admin.sendTransaction({ to: wallet.address, value: amount.mul(2) })
          await wallet.wrap(amount.mul(2))
        })

        it('unwraps the requested amount', async () => {
          const previousNativeBalance = await ethers.provider.getBalance(wallet.address)
          const previousWrappedBalance = await wrappedNativeToken.balanceOf(wallet.address)

          await wallet.unwrap(amount)

          const currentNativeBalance = await ethers.provider.getBalance(wallet.address)
          expect(currentNativeBalance).to.be.equal(previousNativeBalance.add(amount))

          const currentWrappedBalance = await wrappedNativeToken.balanceOf(wallet.address)
          expect(currentWrappedBalance).to.be.equal(previousWrappedBalance.sub(amount))
        })

        it('emits an event', async () => {
          const tx = await wallet.unwrap(amount)
          await assertEvent(tx, 'Unwrap', { amount })
        })
      })

      context('when the wallet does not have enough wrapped native tokens', () => {
        it('reverts', async () => {
          await expect(wallet.unwrap(amount)).to.be.revertedWith('WNT_NOT_ENOUGH_BALANCE')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', async () => {
        wallet = wallet.connect(other)
      })

      it('reverts', async () => {
        await expect(wallet.unwrap(amount)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
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
        wallet = wallet.connect(admin)
      })

      context('when the wallet has joined before', async () => {
        const joinAmount = fp(150)

        beforeEach('mint tokens', async () => {
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
                await wallet.connect(admin).setPerformanceFee(performanceFee)
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
          const expectedAmountOutAfterFees = expectedAmountOut.sub(swapFeeAmount)

          beforeEach('set swap fee', async () => {
            await wallet.connect(admin).setSwapFee(swapFee)
          })

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
            expect(currentFeeCollectorBalance).to.be.equal(previousFeeCollectorBalance.add(swapFeeAmount))
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
              tokenIn,
              tokenOut,
              amountIn: amount,
              amountOut: expectedAmountOutAfterFees,
              minAmountOut: expectedMinAmountOut,
              fee: swapFeeAmount,
              data,
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
            await priceOracle.mockRate(ORACLE_RATE)
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
