import {
  advanceTime,
  currentTimestamp,
  deploy,
  fp,
  getSigner,
  impersonate,
  incrementBlocks,
  instanceAt,
  toUSDC,
  YEAR,
} from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { ethers } from 'hardhat'

/* eslint-disable no-secrets/no-secrets */

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const AUSDC = '0xBcca60bB61934080951369a648Fb03DF4F96263C'
const WHALE = '0x55FE002aefF02F77364de339a1292923A15844B8'

const LENDING_POOL = '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9'

describe('AaveV2Strategy - USDC', function () {
  let strategy: Contract, usdc: Contract, aUsdc: Contract, registry: Contract
  let whale: SignerWithAddress

  const DATA = '0x'
  const SLIPPAGE = 0
  const JOIN_AMOUNT = toUSDC(50)

  before('impersonate whale', async () => {
    whale = await impersonate(WHALE, fp(100))
  })

  before('deploy strategy', async () => {
    const admin = await getSigner()
    registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [admin.address])
    strategy = await deploy('AaveV2Strategy', [USDC, LENDING_POOL, registry.address])
  })

  before('load tokens', async () => {
    usdc = await instanceAt('IERC20', USDC)
    aUsdc = await instanceAt('IAaveV2Token', await strategy.aToken())
  })

  it('deploys the strategy correctly', async () => {
    expect(await strategy.token()).to.be.equal(USDC)
    expect(await strategy.aToken()).to.be.equal(AUSDC)
    expect(await strategy.lendingPool()).to.be.equal(LENDING_POOL)
    expect(await strategy.valueRate()).to.be.equal(fp(1))
    expect(await strategy.lastValue(strategy.address)).to.be.equal(0)

    expect(await strategy.registry()).to.be.equal(registry.address)
    expect(await strategy.NAMESPACE()).to.be.equal(ethers.utils.solidityKeccak256(['string'], ['STRATEGY']))
  })

  it('computes the join tokens correctly', async () => {
    const joinTokens = await strategy.joinTokens()
    expect(joinTokens).to.have.lengthOf(1)
    expect(joinTokens[0]).to.be.equal(USDC)
  })

  it('computes the exit tokens correctly', async () => {
    const exitTokens = await strategy.exitTokens()
    expect(exitTokens).to.have.lengthOf(1)
    expect(exitTokens[0]).to.be.equal(AUSDC)
  })

  it('joins the strategy', async () => {
    await usdc.connect(whale).transfer(strategy.address, JOIN_AMOUNT)

    const previousUsdcBalance = await usdc.balanceOf(strategy.address)
    const previousAUsdcBalance = await aUsdc.balanceOf(strategy.address)

    await strategy.join([USDC], [JOIN_AMOUNT], SLIPPAGE, DATA)

    const currentUsdcBalance = await usdc.balanceOf(strategy.address)
    expect(currentUsdcBalance).to.be.equal(previousUsdcBalance.sub(JOIN_AMOUNT))

    const currentAUsdcBalance = await aUsdc.balanceOf(strategy.address)
    expect(currentAUsdcBalance).to.be.equal(previousAUsdcBalance.add(JOIN_AMOUNT))
  })

  it('accrues value over time', async () => {
    const previousValue = await strategy.lastValue(strategy.address)

    await advanceTime(YEAR)
    await incrementBlocks(10)

    const currentValue = await strategy.lastValue(strategy.address)
    expect(currentValue).to.be.gt(previousValue)
  })

  it('accrues rewards over time', async () => {
    const incentivesController = await instanceAt('IAaveV2IncentivesController', await strategy.incentivesController())
    if ((await currentTimestamp()).gt(await incentivesController.getDistributionEnd())) {
      console.log('AAVE V2 liquidity mining ended')
    } else {
      const rewardsToken = await instanceAt('IERC20', await incentivesController.REWARD_TOKEN())
      const previousBalance = await rewardsToken.balanceOf(strategy.address)

      await strategy.claim('0x')

      const currentBalance = await rewardsToken.balanceOf(strategy.address)
      expect(currentBalance).to.be.gt(previousBalance)
    }
  })

  it('exits with a 50%', async () => {
    const previousValue = await strategy.lastValue(strategy.address)
    const previousUsdcBalance = await usdc.balanceOf(strategy.address)
    const previousAUsdcBalance = await aUsdc.balanceOf(strategy.address)

    const exitAmount = previousAUsdcBalance.div(2)
    await strategy.exit([AUSDC], [exitAmount], SLIPPAGE, DATA)

    const currentValue = await strategy.lastValue(strategy.address)
    expect(currentValue).to.be.lt(previousValue)

    // USDC balance should be increased due to the accrued interest
    const currentUsdcBalance = await usdc.balanceOf(strategy.address)
    expect(currentUsdcBalance).to.be.gt(previousUsdcBalance.add(JOIN_AMOUNT.div(2)))

    // aUSDC balance should be reduced by the same ratio
    const currentAUsdcBalance = await aUsdc.balanceOf(strategy.address)
    const expectedAUsdcBalance = previousAUsdcBalance.sub(exitAmount)
    expect(currentAUsdcBalance).to.be.at.least(expectedAUsdcBalance.sub(1))
    expect(currentAUsdcBalance).to.be.at.most(expectedAUsdcBalance.add(1))
  })

  it('exits with a 100%', async () => {
    const previousUsdcBalance = await usdc.balanceOf(strategy.address)

    const exitAmount = await aUsdc.balanceOf(strategy.address)
    await strategy.exit([AUSDC], [exitAmount], SLIPPAGE, DATA)

    // More than the entire joined amount should be back to the strategy
    const currentUsdcBalance = await usdc.balanceOf(strategy.address)
    expect(currentUsdcBalance).to.be.gt(JOIN_AMOUNT)
    expect(currentUsdcBalance).to.be.gt(previousUsdcBalance.add(JOIN_AMOUNT.div(2)))

    // There should not be any remaining aUSDC balance
    const currentAUsdcBalance = await aUsdc.balanceOf(strategy.address)
    expect(currentAUsdcBalance).to.be.equal(0)
  })
})
