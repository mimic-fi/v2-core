import { assertAlmostEqual, bn, deploy, fp, getSigner, impersonate, instanceAt } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { ethers } from 'hardhat'

/* eslint-disable no-secrets/no-secrets */

const CRV = '0xD533a949740bb3306d119CC777fa900bA034cd52'
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const POOL = '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7'
const CRV3 = '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490'
const GAUGE = '0xbfcf63294ad7105dea65aa58f8ae5be2d9d0952a'

const WHALE = '0x55FE002aefF02F77364de339a1292923A15844B8'

describe('Curve3PoolStrategy - USDC', function () {
  let strategy: Contract, pool: Contract, gauge: Contract, registry: Contract
  let usdc: Contract, crv3: Contract, crv: Contract
  let whale: SignerWithAddress

  const toUSDC = (amount: number) => fp(amount).div(1e12)

  const DATA = '0x'
  const SLIPPAGE = fp(0.001)
  const JOIN_AMOUNT = toUSDC(500)

  before('impersonate whale', async () => {
    whale = await impersonate(WHALE, fp(100))
  })

  before('deploy strategy', async () => {
    const admin = await getSigner()
    registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [admin.address])
    strategy = await deploy('Curve3PoolStrategy', [USDC, CRV3, POOL, GAUGE, registry.address])
  })

  before('load tokens', async () => {
    crv = await instanceAt('IERC20', CRV)
    usdc = await instanceAt('IERC20', USDC)
    crv3 = await instanceAt('IERC20', CRV3)
    pool = await instanceAt('ICurve3Pool', POOL)
    gauge = await instanceAt('ICurveLiquidityGauge', GAUGE)
  })

  it('deploys the strategy correctly', async () => {
    expect(await strategy.token()).to.be.equal(USDC)
    expect(await strategy.tokenIndex()).to.be.equal(1)
    expect(await strategy.tokenScale()).to.be.equal(1e12)

    expect(await strategy.crv()).to.be.equal(CRV)
    expect(await strategy.pool()).to.be.equal(POOL)
    expect(await strategy.poolToken()).to.be.equal(CRV3)

    expect(await strategy.valueRate()).to.be.equal(fp(1))
    expect(await strategy.lastValue(strategy.address)).to.be.equal(0)

    expect(await strategy.registry()).to.be.equal(registry.address)
    expect(await strategy.NAMESPACE()).to.be.equal(ethers.utils.solidityKeccak256(['string'], ['STRATEGY']))
  })

  it('joins the strategy', async () => {
    await usdc.connect(whale).transfer(strategy.address, JOIN_AMOUNT)

    const previousUsdcBalance = await usdc.balanceOf(strategy.address)
    const previous3CrvBalance = await crv3.balanceOf(strategy.address)
    const previousStaked3CrvBalance = await gauge.balanceOf(strategy.address)

    await strategy.join(JOIN_AMOUNT, SLIPPAGE, DATA)

    const currentUsdcBalance = await usdc.balanceOf(strategy.address)
    expect(currentUsdcBalance).to.be.equal(previousUsdcBalance.sub(JOIN_AMOUNT))

    const current3CrvBalance = await crv3.balanceOf(strategy.address)
    expect(current3CrvBalance).to.be.equal(previous3CrvBalance)

    const currentStaked3CrvBalance = await gauge.balanceOf(strategy.address)
    const poolTokenPrice = await pool.get_virtual_price()
    const expected3CrvAmount = JOIN_AMOUNT.mul(1e12).mul(fp(1)).div(poolTokenPrice)
    assertAlmostEqual(currentStaked3CrvBalance, previousStaked3CrvBalance.add(expected3CrvAmount), 0.0001)
  })

  it('accrues rewards over time', async () => {
    const previousBalance = await crv.balanceOf(strategy.address)

    await strategy.claim('0x')

    const currentBalance = await crv.balanceOf(strategy.address)
    expect(currentBalance).to.be.gt(previousBalance)
  })

  it('gains swap fees', async () => {
    const token0 = await instanceAt('IERC20Metadata', await pool.coins(0))
    const token1 = await instanceAt('IERC20Metadata', await pool.coins(1))
    const previousValue = await strategy.lastValue(strategy.address)

    const amount0 = fp(1000).div(bn(10).pow(18 - (await token0.decimals())))
    for (let index = 0; index < 100; index++) {
      await token0.connect(whale).approve(POOL, amount0)
      await pool.connect(whale).exchange(0, 1, amount0, 0)
    }

    const amount1 = fp(1000).div(bn(10).pow(18 - (await token1.decimals())))
    for (let index = 0; index < 100; index++) {
      await token1.connect(whale).approve(POOL, amount1)
      await pool.connect(whale).exchange(1, 0, amount1, 0)
    }

    const currentValue = await strategy.lastValue(strategy.address)
    expect(currentValue).to.be.gt(previousValue)
  })

  it('exits with a 50%', async () => {
    const previous3CrvBalance = await gauge.balanceOf(strategy.address)

    const ratio = fp(0.5)
    await strategy.exit(ratio, SLIPPAGE, DATA)

    // 3CRV balance should be reduced by the same ratio
    const current3CrvBalance = await gauge.balanceOf(strategy.address)
    const expected3CrvBalance = previous3CrvBalance.mul(fp(1).sub(ratio)).div(fp(1))
    expect(current3CrvBalance).to.be.at.least(expected3CrvBalance.sub(1))
    expect(current3CrvBalance).to.be.at.most(expected3CrvBalance.add(1))
  })

  it('exits with a 100%', async () => {
    const ratio = fp(1)
    await strategy.exit(ratio, SLIPPAGE, DATA)

    // There should not be any remaining 3CRV balance
    expect(await crv3.balanceOf(strategy.address)).to.be.equal(0)
    expect(await gauge.balanceOf(strategy.address)).to.be.equal(0)
  })
})
