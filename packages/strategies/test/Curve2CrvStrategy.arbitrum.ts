import { assertAlmostEqual, bn, deploy, fp, getSigner, impersonate, instanceAt, toUSDC } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { ethers } from 'hardhat'

/* eslint-disable no-secrets/no-secrets */

const CRV = '0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978'
const USDC = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8'
const POOL = '0x7f90122BF0700F9E7e1F688fe926940E8839F353'
const CVX_POOL = '0x971E732B5c91A59AEa8aa5B0c763E6d648362CF8'
const BOOSTER = '0xF403C135812408BFbE8713b5A23a04b3D48AAE31'

const WHALE = '0x62383739d68dd0f844103db8dfb05a7eded5bbe6'

describe('Curve2CrvStrategy - USDC', function () {
  let whale: SignerWithAddress
  let strategy: Contract, pool: Contract, cvxPool: Contract, usdc: Contract, crv: Contract, registry: Contract

  const DATA = '0x'
  const SLIPPAGE = fp(0.001)
  const JOIN_AMOUNT = toUSDC(100)

  before('impersonate whale', async () => {
    whale = await impersonate(WHALE, fp(10))
  })

  before('deploy strategy', async () => {
    const admin = await getSigner()
    registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [admin.address])
    strategy = await deploy('Curve2CrvStrategy', [POOL, USDC, BOOSTER, registry.address])
  })

  before('load dependencies', async () => {
    crv = await instanceAt('IERC20', await strategy.crv())
    usdc = await instanceAt('IERC20', await strategy.token())
    pool = await instanceAt('I2CrvPool', await strategy.pool())
    cvxPool = await instanceAt('ICvxPool', await strategy.cvxPool())
  })

  it('deploys the strategy correctly', async () => {
    expect(await strategy.token()).to.be.equal(USDC)
    expect(await strategy.tokenIndex()).to.be.equal(0)
    expect(await strategy.tokenScale()).to.be.equal(1e12)

    expect(await strategy.crv()).to.be.equal(CRV)
    expect(await strategy.pool()).to.be.equal(POOL)
    expect(await strategy.poolId()).to.be.equal(7)
    expect(await strategy.cvxPool()).to.be.equal(CVX_POOL)
    expect(await strategy.booster()).to.be.equal(BOOSTER)

    expect(await strategy.valueRate()).to.be.equal(fp(1))
    expect(await strategy.lastValue(strategy.address)).to.be.equal(0)

    expect(await strategy.registry()).to.be.equal(registry.address)
    expect(await strategy.NAMESPACE()).to.be.equal(ethers.utils.solidityKeccak256(['string'], ['STRATEGY']))
  })

  it('joins the strategy', async () => {
    await usdc.connect(whale).transfer(strategy.address, JOIN_AMOUNT)

    const previousUsdcBalance = await usdc.balanceOf(strategy.address)
    const previousPoolBalance = await pool.balanceOf(strategy.address)
    const previousCvxPoolBalance = await cvxPool.balanceOf(strategy.address)

    await strategy.join([USDC], [JOIN_AMOUNT], SLIPPAGE, DATA)

    const currentUsdcBalance = await usdc.balanceOf(strategy.address)
    expect(currentUsdcBalance).to.be.equal(previousUsdcBalance.sub(JOIN_AMOUNT))

    const currentPoolBalance = await pool.balanceOf(strategy.address)
    expect(currentPoolBalance).to.be.equal(previousPoolBalance)

    const poolTokenPrice = await pool.get_virtual_price()
    const currentCvxPoolBalance = await cvxPool.balanceOf(strategy.address)
    const expectedCvxPoolAmount = JOIN_AMOUNT.mul(1e12).mul(fp(1)).div(poolTokenPrice)
    assertAlmostEqual(expectedCvxPoolAmount, currentCvxPoolBalance.sub(previousCvxPoolBalance), 0.0005)
  })

  it('accrues rewards over time', async () => {
    const previousCrvBalance = await crv.balanceOf(strategy.address)

    await strategy.claim(DATA)

    const currentCrvBalance = await crv.balanceOf(strategy.address)
    expect(currentCrvBalance).to.be.gt(previousCrvBalance)
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
    const previousUsdcBalance = await usdc.balanceOf(strategy.address)
    const previousCvxPoolBalance = await cvxPool.balanceOf(strategy.address)

    const amountIn = previousCvxPoolBalance.div(2)
    await strategy.exit([CVX_POOL], [amountIn], SLIPPAGE, DATA)

    const currentCvxPoolBalance = await cvxPool.balanceOf(strategy.address)
    expect(currentCvxPoolBalance).to.be.equal(previousCvxPoolBalance.sub(amountIn))

    const poolTokenPrice = await pool.get_virtual_price()
    const currentUsdcBalance = await usdc.balanceOf(strategy.address)
    const expectedUsdcBalance = amountIn.mul(poolTokenPrice).div(fp(1)).div(1e12)
    assertAlmostEqual(expectedUsdcBalance, currentUsdcBalance.sub(previousUsdcBalance), 0.0005)
  })
})
