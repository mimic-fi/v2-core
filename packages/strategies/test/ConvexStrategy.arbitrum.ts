import { advanceTime, deploy, fp, getSigner, impersonate, instanceAt, MONTH, toUSDC } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { ethers } from 'hardhat'

/* eslint-disable no-secrets/no-secrets */

const CRV = '0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978'
const POOL = '0x7f90122BF0700F9E7e1F688fe926940E8839F353'
const CVX_POOL = '0x971E732B5c91A59AEa8aa5B0c763E6d648362CF8'
const BOOSTER = '0xF403C135812408BFbE8713b5A23a04b3D48AAE31'

const WHALE = '0xf403c135812408bfbe8713b5a23a04b3d48aae31'

describe('ConvexCrvStrategy - 2CRV', function () {
  let whale: SignerWithAddress
  let strategy: Contract, pool: Contract, cvxPool: Contract, crv: Contract, registry: Contract

  const DATA = '0x'
  const SLIPPAGE = fp(0)
  const JOIN_AMOUNT = toUSDC(100)

  before('impersonate whale', async () => {
    whale = await impersonate(WHALE, fp(10))
  })

  before('deploy strategy', async () => {
    const admin = await getSigner()
    registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [admin.address])
    strategy = await deploy('ConvexCrvStrategy', [POOL, BOOSTER, registry.address])
  })

  before('load dependencies', async () => {
    crv = await instanceAt('IERC20', await strategy.crv())
    pool = await instanceAt('I2CrvPool', await strategy.pool())
    cvxPool = await instanceAt('ICvxPool', await strategy.cvxPool())
  })

  it('deploys the strategy correctly', async () => {
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
    await pool.connect(whale).transfer(strategy.address, JOIN_AMOUNT)

    const previousPoolBalance = await pool.balanceOf(strategy.address)
    const previousCvxPoolBalance = await cvxPool.balanceOf(strategy.address)

    await strategy.join([POOL], [JOIN_AMOUNT], SLIPPAGE, DATA)

    const currentPoolBalance = await pool.balanceOf(strategy.address)
    expect(currentPoolBalance).to.be.equal(previousPoolBalance.sub(JOIN_AMOUNT))

    const currentCvxPoolBalance = await cvxPool.balanceOf(strategy.address)
    expect(currentCvxPoolBalance).to.be.equal(previousCvxPoolBalance.add(JOIN_AMOUNT))
  })

  it('accrues rewards over time', async () => {
    const previousCrvBalance = await crv.balanceOf(strategy.address)

    await advanceTime(MONTH)
    await strategy.claim(DATA)

    const currentCrvBalance = await crv.balanceOf(strategy.address)
    expect(currentCrvBalance).to.be.gt(previousCrvBalance)
  })

  it('exits with a 50%', async () => {
    const previousPoolBalance = await pool.balanceOf(strategy.address)
    const previousCvxPoolBalance = await cvxPool.balanceOf(strategy.address)

    const amountIn = previousCvxPoolBalance.div(2)
    await strategy.exit([CVX_POOL], [amountIn], SLIPPAGE, DATA)

    const currentCvxPoolBalance = await cvxPool.balanceOf(strategy.address)
    expect(currentCvxPoolBalance).to.be.equal(previousCvxPoolBalance.sub(amountIn))

    const currentPoolBalance = await pool.balanceOf(strategy.address)
    expect(currentPoolBalance).to.be.equal(previousPoolBalance.add(amountIn))
  })
})
