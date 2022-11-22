import { defaultAbiCoder } from '@ethersproject/abi'
import { deploy, fp, impersonate, instanceAt, MAX_UINT256, toUSDC, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

/* eslint-disable no-secrets/no-secrets */

const SOURCE = {
  HOP: 0,
}

const USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const WHALE = '0xa8f49d90b24d6a007e5f47bf86d122a9f3211734'
const HOP_USDC_AMM = '0x76b22b8C1079A44F1211D867D68b1eda76a635A7'

describe('BridgeConnector', () => {
  let connector: Contract, usdc: Contract, whale: SignerWithAddress

  before('create bridge connector', async () => {
    connector = await deploy('BridgeConnector', [ZERO_ADDRESS])
  })

  before('load tokens and accounts', async () => {
    usdc = await instanceAt('IERC20', USDC)
    whale = await impersonate(WHALE, fp(100))
  })

  context('Hop', () => {
    let amm: Contract, hUsdc: Contract, exchange: string

    const source = SOURCE.HOP

    beforeEach('load hop AMM', async () => {
      amm = await instanceAt('IHopL2AMM', HOP_USDC_AMM)
      hUsdc = await instanceAt('IERC20', await amm.hToken())
      exchange = await amm.exchangeAddress()
    })

    context('bridge to mainnet', () => {
      const chainId = 1
      const amount = toUSDC(3)
      const slippage = fp(0.03)
      const bonderFee = toUSDC(0.03)
      const data = defaultAbiCoder.encode(['address', 'uint256', 'uint256'], [HOP_USDC_AMM, bonderFee, slippage])

      it('should send the canonical tokens to the exchange', async () => {
        const previousSenderBalance = await usdc.balanceOf(whale.address)
        const previousExchangeBalance = await usdc.balanceOf(exchange)
        const previousConnectorBalance = await usdc.balanceOf(connector.address)

        await usdc.connect(whale).transfer(connector.address, amount)
        await connector.connect(whale).bridge(source, chainId, USDC, amount, data)

        const currentSenderBalance = await usdc.balanceOf(whale.address)
        expect(currentSenderBalance).to.be.equal(previousSenderBalance.sub(amount))

        const currentExchangeBalance = await usdc.balanceOf(exchange)
        expect(currentExchangeBalance).to.be.equal(previousExchangeBalance.add(amount))

        const currentConnectorBalance = await usdc.balanceOf(connector.address)
        expect(currentConnectorBalance).to.be.equal(previousConnectorBalance)
      })

      it('should burn at least the requested hop tokens', async () => {
        const previousBridgeHopUsdcBalance = await hUsdc.totalSupply()

        await usdc.connect(whale).transfer(connector.address, amount)
        await connector.connect(whale).bridge(source, chainId, USDC, amount, data)

        const minAmount = amount.sub(amount.mul(slippage).div(fp(1)))
        const burnedAmount = previousBridgeHopUsdcBalance.sub(await hUsdc.totalSupply())
        expect(burnedAmount).to.be.at.least(minAmount)
      })

      it('does not affect the canonical token balance of the amm', async () => {
        const previousAmmUsdcBalance = await usdc.balanceOf(HOP_USDC_AMM)

        await usdc.connect(whale).transfer(connector.address, amount)
        await connector.connect(whale).bridge(source, chainId, USDC, amount, data)

        const currentAmmUsdcBalance = await usdc.balanceOf(HOP_USDC_AMM)
        expect(currentAmmUsdcBalance).to.be.equal(previousAmmUsdcBalance)
      })
    })

    context('bridge to arbitrum', () => {
      const chainId = 42161
      const amount = toUSDC(3)
      const slippage = fp(0.03)
      const bonderFee = toUSDC(0.03)
      const deadline = MAX_UINT256
      const data = defaultAbiCoder.encode(
        ['address', 'uint256', 'uint256', 'uint256', 'uint256'],
        [HOP_USDC_AMM, bonderFee, slippage, slippage, deadline]
      )

      it('should send the canonical tokens to the exchange', async () => {
        const previousSenderBalance = await usdc.balanceOf(whale.address)
        const previousExchangeBalance = await usdc.balanceOf(exchange)
        const previousConnectorBalance = await usdc.balanceOf(connector.address)

        await usdc.connect(whale).transfer(connector.address, amount)
        await connector.connect(whale).bridge(source, chainId, USDC, amount, data)

        const currentSenderBalance = await usdc.balanceOf(whale.address)
        expect(currentSenderBalance).to.be.equal(previousSenderBalance.sub(amount))

        const currentExchangeBalance = await usdc.balanceOf(exchange)
        expect(currentExchangeBalance).to.be.equal(previousExchangeBalance.add(amount))

        const currentConnectorBalance = await usdc.balanceOf(connector.address)
        expect(currentConnectorBalance).to.be.equal(previousConnectorBalance)
      })

      it('should burn at least the requested hop tokens', async () => {
        const previousBridgeHopUsdcBalance = await hUsdc.totalSupply()

        await usdc.connect(whale).transfer(connector.address, amount)
        await connector.connect(whale).bridge(source, chainId, USDC, amount, data)

        const minAmount = amount.sub(amount.mul(slippage).div(fp(1)))
        const burnedAmount = previousBridgeHopUsdcBalance.sub(await hUsdc.totalSupply())
        expect(burnedAmount).to.be.at.least(minAmount)
      })

      it('does not affect the canonical token balance of the amm', async () => {
        const previousAmmUsdcBalance = await usdc.balanceOf(HOP_USDC_AMM)

        await usdc.connect(whale).transfer(connector.address, amount)
        await connector.connect(whale).bridge(source, chainId, USDC, amount, data)

        const currentAmmUsdcBalance = await usdc.balanceOf(HOP_USDC_AMM)
        expect(currentAmmUsdcBalance).to.be.equal(previousAmmUsdcBalance)
      })
    })
  })
})
