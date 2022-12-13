import { fp, impersonate, instanceAt, toUSDC, toWBTC } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { Contract } from 'ethers'

import { SOURCES } from '../../src/constants'
import { loadOrGetParaswapSwapData } from '../helpers/paraswap'

export function itBehavesLikeParaswapV5Connector(
  CHAIN: number,
  USDC: string,
  WETH: string,
  WBTC: string,
  WHALE: string,
  SLIPPAGE: number
): void {
  let weth: Contract, usdc: Contract, wbtc: Contract, whale: SignerWithAddress

  const source = SOURCES.PARASWAP_V5

  before('load tokens and accounts', async function () {
    weth = await instanceAt('IERC20Metadata', WETH)
    wbtc = await instanceAt('IERC20Metadata', WBTC)
    usdc = await instanceAt('IERC20Metadata', USDC)
    whale = await impersonate(WHALE, fp(100))
  })

  context('USDC-WETH', () => {
    const amountIn = toUSDC(10e3)

    it('swaps correctly', async function () {
      const { minAmountOut, data } = await loadOrGetParaswapSwapData(
        CHAIN,
        this.connector,
        usdc,
        weth,
        amountIn,
        SLIPPAGE
      )

      await usdc.connect(whale).transfer(this.connector.address, amountIn)
      await this.connector.connect(whale).swap(source, USDC, WETH, amountIn, minAmountOut, data)

      const swappedBalance = await weth.balanceOf(this.connector.address)
      const expectedMinAmountOut = await this.getExpectedMinAmountOut(USDC, WETH, amountIn, SLIPPAGE)
      expect(swappedBalance).to.be.at.least(expectedMinAmountOut)
    })
  })

  context('WETH-USDC', () => {
    const amountIn = fp(1)

    it('swaps correctly', async function () {
      const { minAmountOut, data } = await loadOrGetParaswapSwapData(
        CHAIN,
        this.connector,
        weth,
        usdc,
        amountIn,
        SLIPPAGE
      )

      await weth.connect(whale).transfer(this.connector.address, amountIn)
      await this.connector.connect(whale).swap(source, WETH, USDC, amountIn, minAmountOut, data)

      const swappedBalance = await usdc.balanceOf(this.connector.address)
      const expectedMinAmountOut = await this.getExpectedMinAmountOut(WETH, USDC, amountIn, SLIPPAGE)
      expect(swappedBalance).to.be.at.least(expectedMinAmountOut)
    })
  })

  context('USDC-WBTC', () => {
    const amountIn = toUSDC(10e3)

    it('swaps correctly', async function () {
      const { minAmountOut, data } = await loadOrGetParaswapSwapData(
        CHAIN,
        this.connector,
        usdc,
        wbtc,
        amountIn,
        SLIPPAGE
      )

      await usdc.connect(whale).transfer(this.connector.address, amountIn)
      await this.connector.connect(whale).swap(source, USDC, WBTC, amountIn, minAmountOut, data)

      const swappedBalance = await wbtc.balanceOf(this.connector.address)
      const expectedMinAmountOut = await this.getExpectedMinAmountOut(USDC, WBTC, amountIn, SLIPPAGE)
      expect(swappedBalance).to.be.at.least(expectedMinAmountOut)
    })
  })

  context('WBTC-USDC', () => {
    const amountIn = toWBTC(1)

    it('swaps correctly', async function () {
      const { minAmountOut, data } = await loadOrGetParaswapSwapData(
        CHAIN,
        this.connector,
        wbtc,
        usdc,
        amountIn,
        SLIPPAGE
      )

      await wbtc.connect(whale).transfer(this.connector.address, amountIn)
      await this.connector.connect(whale).swap(source, WBTC, USDC, amountIn, minAmountOut, data)

      const swappedBalance = await usdc.balanceOf(this.connector.address)
      const expectedMinAmountOut = await this.getExpectedMinAmountOut(WBTC, USDC, amountIn, SLIPPAGE)
      expect(swappedBalance).to.be.at.least(expectedMinAmountOut)
    })
  })
}
