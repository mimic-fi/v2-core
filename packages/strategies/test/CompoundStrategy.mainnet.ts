import { assertAlmostEqual, deploy, fp, getSigner, impersonate, instanceAt, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

/* eslint-disable no-secrets/no-secrets */

const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
const CDAI = '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643'
const WHALE = '0x075e72a5edf65f0a5f44699c7654c1a76941ddc8'

describe('CompoundStrategy - DAI', function () {
  let strategy: Contract, dai: Contract, cDai: Contract, comp: Contract, registry: Contract
  let whale: SignerWithAddress

  const ERROR = 0.000001
  const JOIN_AMOUNT = fp(50)

  before('load signers', async () => {
    whale = await impersonate(WHALE, fp(100))
  })

  before('deploy strategy', async () => {
    const admin = await getSigner()
    registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [admin.address])
    strategy = await deploy('CompoundStrategy', [DAI, CDAI, registry.address])
  })

  before('load tokens', async () => {
    dai = await instanceAt('IERC20', DAI)
    cDai = await instanceAt('ICToken', CDAI)
    comp = await instanceAt('IERC20', await strategy.comp())
  })

  it('deploys the strategy correctly', async () => {
    expect(await strategy.token()).to.be.equal(DAI)
    expect(await strategy.cToken()).to.be.equal(CDAI)
    expect(await strategy.valueRate()).to.be.equal(fp(1))
    expect(await strategy.lastValue(strategy.address)).to.be.equal(0)
  })

  it('joins the strategy', async () => {
    await dai.connect(whale).transfer(strategy.address, JOIN_AMOUNT.mul(2))

    const previousValue = await strategy.lastValue(strategy.address)
    const previousDaiBalance = await dai.balanceOf(strategy.address)
    const previousCDaiBalance = await cDai.balanceOf(strategy.address)

    await strategy.connect(whale).join(JOIN_AMOUNT, 0, '0x')

    const currentDaiBalance = await dai.balanceOf(strategy.address)
    expect(currentDaiBalance).to.be.equal(previousDaiBalance.sub(JOIN_AMOUNT))

    const currentCDaiBalance = await cDai.balanceOf(strategy.address)
    expect(currentCDaiBalance).to.be.gt(previousCDaiBalance)

    const cDaiRate = await cDai.exchangeRateStored()
    const expectedValue = currentCDaiBalance.mul(cDaiRate).div(fp(1))
    const currentValue = await strategy.lastValue(strategy.address)
    expect(currentValue).to.be.gt(previousValue)
    expect(currentValue).to.be.equal(expectedValue)
  })

  it('claims rewards', async () => {
    const previousBalance = await comp.balanceOf(strategy.address)

    await strategy.claim('0x')

    const currentBalance = await comp.balanceOf(strategy.address)
    expect(currentBalance).to.be.gt(previousBalance)
  })

  it('exits with a 50%', async () => {
    const previousValue = await strategy.lastValue(strategy.address)
    const previousDaiBalance = await dai.balanceOf(strategy.address)
    const previousCDaiBalance = await cDai.balanceOf(strategy.address)

    const ratio = fp(0.5)
    await strategy.connect(whale).exit(ratio, 0, '0x')

    const currentValue = await strategy.lastValue(strategy.address)
    expect(currentValue).to.be.lt(previousValue)

    // DAI balance should be increased by the ratio applied to the joined amount
    const currentDaiBalance = await dai.balanceOf(strategy.address)
    const expectedDaiBalance = previousDaiBalance.add(JOIN_AMOUNT.div(2))
    assertAlmostEqual(currentDaiBalance, expectedDaiBalance, ERROR)

    // cDAI balance should be reduced by the same ratio
    const currentCDaiBalance = await cDai.balanceOf(strategy.address)
    const expectedCDaiBalance = previousCDaiBalance.mul(fp(1).sub(ratio)).div(fp(1))
    assertAlmostEqual(currentCDaiBalance, expectedCDaiBalance, ERROR)
  })

  it('exits with a 100%', async () => {
    const previousDaiBalance = await dai.balanceOf(strategy.address)

    const ratio = fp(1)
    await strategy.connect(whale).exit(ratio, 0, '0x')

    // Entire joined amount should be back to the strategy
    const currentDaiBalance = await dai.balanceOf(strategy.address)
    const expectedDaiBalance = previousDaiBalance.add(JOIN_AMOUNT.div(2))
    assertAlmostEqual(currentDaiBalance, expectedDaiBalance, ERROR)

    // There should not be any remaining cDAI balance
    const currentCDaiBalance = await cDai.balanceOf(strategy.address)
    expect(currentCDaiBalance).to.be.equal(0)
  })
})
