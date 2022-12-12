import { defaultAbiCoder } from '@ethersproject/abi'
import { fp, impersonate, instanceAt, toUSDC, toWBTC } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { Contract } from 'ethers'

import { SOURCES } from '../../src/constants'

export function itBehavesLikeUniswapV3Connector(
  USDC: string,
  WETH: string,
  WBTC: string,
  WHALE: string,
  SLIPPAGE: number,
  WETH_USDC_FEE: number,
  WETH_WBTC_FEE: number
): void {
  let weth: Contract, usdc: Contract, wbtc: Contract, whale: SignerWithAddress

  const source = SOURCES.UNISWAP_V3

  before('load tokens and accounts', async function () {
    weth = await instanceAt('IERC20Metadata', WETH)
    wbtc = await instanceAt('IERC20Metadata', WBTC)
    usdc = await instanceAt('IERC20Metadata', USDC)
    whale = await impersonate(WHALE, fp(100))
  })

  context('single swap', () => {
    const data = defaultAbiCoder.encode(['uint24'], [WETH_USDC_FEE])

    context('USDC-WETH', () => {
      const amountIn = toUSDC(10e3)

      it('swaps correctly', async function () {
        const previousBalance = await weth.balanceOf(this.connector.address)
        await usdc.connect(whale).transfer(this.connector.address, amountIn)

        await this.connector.connect(whale).swap(source, USDC, WETH, amountIn, 0, data)

        const currentBalance = await weth.balanceOf(this.connector.address)
        const expectedMinAmountOut = await this.getExpectedMinAmountOut(USDC, WETH, amountIn, SLIPPAGE)
        expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
      })
    })

    context('WETH-USDC', () => {
      const amountIn = fp(1)

      it('swaps correctly', async function () {
        const previousBalance = await usdc.balanceOf(this.connector.address)
        await weth.connect(whale).transfer(this.connector.address, amountIn)

        await this.connector.connect(whale).swap(source, WETH, USDC, amountIn, 0, data)

        const currentBalance = await usdc.balanceOf(this.connector.address)
        const expectedMinAmountOut = await this.getExpectedMinAmountOut(WETH, USDC, amountIn, SLIPPAGE)
        expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
      })
    })
  })

  context('batch swap', () => {
    const data = defaultAbiCoder.encode(['address[]', 'uint24[]'], [[WETH], [WETH_USDC_FEE, WETH_WBTC_FEE]])

    context('USDC-WBTC', () => {
      const amountIn = toUSDC(10e3)

      it('swaps correctly', async function () {
        const previousBalance = await wbtc.balanceOf(this.connector.address)
        await usdc.connect(whale).transfer(this.connector.address, amountIn)

        await this.connector.connect(whale).swap(source, USDC, WBTC, amountIn, 0, data)

        const currentBalance = await wbtc.balanceOf(this.connector.address)
        const expectedMinAmountOut = await this.getExpectedMinAmountOut(USDC, WBTC, amountIn, SLIPPAGE)
        expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
      })
    })

    context('WBTC-USDC', () => {
      const amountIn = toWBTC(1)

      it('swaps correctly', async function () {
        const previousBalance = await usdc.balanceOf(this.connector.address)
        await wbtc.connect(whale).transfer(this.connector.address, amountIn)

        await this.connector.connect(whale).swap(source, WBTC, USDC, amountIn, 0, data)

        const currentBalance = await usdc.balanceOf(this.connector.address)
        const expectedMinAmountOut = await this.getExpectedMinAmountOut(WBTC, USDC, amountIn, SLIPPAGE)
        expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
      })
    })
  })
}
