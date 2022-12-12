import { defaultAbiCoder } from '@ethersproject/abi'
import { deploy, fp, impersonate, instanceAt, pct, toUSDC, toWBTC, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'

import { loadOrGet1inchSwapData } from './helpers/1inch'
import { loadOrGetParaswapSwapData } from './helpers/paraswap'

/* eslint-disable no-secrets/no-secrets */

const SOURCE = {
  UNISWAP_V2: 0,
  UNISWAP_V3: 1,
  BALANCER_V2: 2,
  PARASWAP_V5: 3,
  ONE_INCH_V5: 4,
  HOP: 6,
}

const CHAIN = 137

const USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const WETH = '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'
const WBTC = '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6'
const WHALE = '0x21cb017b40abe17b6dfb9ba64a3ab0f24a7e60ea'

const UNISWAP_V2_ROUTER = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff' // QuickSwap
const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
const BALANCER_V2_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'
const PARASWAP_V5_AUGUSTUS = '0xdef171fe48cf0115b1d80b88dc8eab59176fee57'
const ONE_INCH_V5_ROUTER = '0x1111111254EEB25477B68fb85Ed929f73A960582'

const CHAINLINK_ORACLE_USDC_ETH = '0xefb7e6be8356ccc6827799b6a7348ee674a80eae'
const CHAINLINK_ORACLE_WBTC_USD = '0xc907e116054ad103354f2d350fd2514433d57f6f'

describe('SwapConnector', () => {
  let connector: Contract, priceOracle: Contract, feedsProvider: Contract
  let weth: Contract, wbtc: Contract, usdc: Contract
  let whale: SignerWithAddress

  const SLIPPAGE = 0.2

  before('create swap connector', async () => {
    connector = await deploy('SwapConnector', [
      UNISWAP_V2_ROUTER,
      UNISWAP_V3_ROUTER,
      BALANCER_V2_VAULT,
      PARASWAP_V5_AUGUSTUS,
      ONE_INCH_V5_ROUTER,
      ZERO_ADDRESS,
    ])
  })

  before('create price oracle', async () => {
    priceOracle = await deploy('@mimic-fi/v2-price-oracle/artifacts/contracts/oracle/PriceOracle.sol/PriceOracle', [
      WETH,
      ZERO_ADDRESS,
    ])
  })

  before('create price feeds provider', async () => {
    feedsProvider = await deploy(
      '@mimic-fi/v2-price-oracle/artifacts/contracts/feeds/PriceFeedProvider.sol/PriceFeedProvider'
    )
    await feedsProvider.setPriceFeeds(
      [USDC, WBTC],
      [WETH, USDC],
      [CHAINLINK_ORACLE_USDC_ETH, CHAINLINK_ORACLE_WBTC_USD]
    )
  })

  before('load tokens and accounts', async () => {
    weth = await instanceAt('IERC20Metadata', WETH)
    wbtc = await instanceAt('IERC20Metadata', WBTC)
    usdc = await instanceAt('IERC20Metadata', USDC)
    whale = await impersonate(WHALE, fp(100))
  })

  const getExpectedMinAmountOut = async (tokenIn: string, tokenOut: string, amountIn: BigNumber) => {
    const price = await priceOracle.getPrice(feedsProvider.address, tokenIn, tokenOut)
    const expectedAmountOut = price.mul(amountIn).div(fp(1))
    return expectedAmountOut.sub(pct(expectedAmountOut, SLIPPAGE))
  }

  const itSingleSwapsCorrectly = (source: number, usdcWethData: string, wethUsdcData: string) => {
    it('swaps correctly USDC-WETH', async () => {
      const amountIn = toUSDC(10e3)
      const previousBalance = await weth.balanceOf(connector.address)
      await usdc.connect(whale).transfer(connector.address, amountIn)

      await connector.connect(whale).swap(source, USDC, WETH, amountIn, 0, usdcWethData)

      const currentBalance = await weth.balanceOf(connector.address)
      const expectedMinAmountOut = await getExpectedMinAmountOut(USDC, WETH, amountIn)
      expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
    })

    it('swaps correctly WETH-USDC', async () => {
      const amountIn = fp(1)
      const previousBalance = await usdc.balanceOf(connector.address)
      await weth.connect(whale).transfer(connector.address, amountIn)

      await connector.connect(whale).swap(source, WETH, USDC, amountIn, 0, wethUsdcData)

      const currentBalance = await usdc.balanceOf(connector.address)
      const expectedMinAmountOut = await getExpectedMinAmountOut(WETH, USDC, amountIn)
      expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
    })
  }

  const itBatchSwapsCorrectly = (source: number, usdcWbtcData: string, wbtcUsdcData: string) => {
    it('swaps correctly USDC-WBTC', async () => {
      const amountIn = toUSDC(10e3) // USDC 6 decimals
      const previousBalance = await wbtc.balanceOf(connector.address)
      await usdc.connect(whale).transfer(connector.address, amountIn)

      await connector.connect(whale).swap(source, USDC, WBTC, amountIn, 0, usdcWbtcData)

      const currentBalance = await wbtc.balanceOf(connector.address)
      const expectedMinAmountOut = await getExpectedMinAmountOut(USDC, WBTC, amountIn)
      expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
    })

    it('swaps correctly WTBC-USDC', async () => {
      const amountIn = toWBTC(1) // WBTC 8 decimals
      const previousBalance = await usdc.balanceOf(connector.address)
      await wbtc.connect(whale).transfer(connector.address, amountIn)

      await connector.connect(whale).swap(source, WBTC, USDC, amountIn, 0, wbtcUsdcData)

      const currentBalance = await usdc.balanceOf(connector.address)
      const expectedMinAmountOut = await getExpectedMinAmountOut(WBTC, USDC, amountIn)
      expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
    })
  }

  context('Uniswap V2', () => {
    const source = SOURCE.UNISWAP_V2

    context('single swap', () => {
      const data = '0x'

      itSingleSwapsCorrectly(source, data, data)
    })

    context('batch swap', () => {
      const data = defaultAbiCoder.encode(['address[]'], [[WETH]])

      itBatchSwapsCorrectly(source, data, data)
    })
  })

  context('Uniswap V3', () => {
    const source = SOURCE.UNISWAP_V3
    const UNISWAP_V3_FEE = 3000

    context('single swap', () => {
      const data = defaultAbiCoder.encode(['uint24'], [UNISWAP_V3_FEE])

      itSingleSwapsCorrectly(source, data, data)
    })

    context('batch swap', () => {
      const data = defaultAbiCoder.encode(['address[]', 'uint24[]'], [[WETH], [UNISWAP_V3_FEE, UNISWAP_V3_FEE]])

      itBatchSwapsCorrectly(source, data, data)
    })
  })

  context('Balancer V2', () => {
    const source = SOURCE.BALANCER_V2

    context('single swap', () => {
      const BALANCER_POOL_WETH_WBTC_USDC_ID = '0x03cd191f589d12b0582a99808cf19851e468e6b500010000000000000000000a'

      const data = defaultAbiCoder.encode(['bytes32'], [BALANCER_POOL_WETH_WBTC_USDC_ID])

      itSingleSwapsCorrectly(source, data, data)
    })

    context('batch swap', () => {
      const BALANCER_POOL_WETH_USDC_ID = '0x10f21c9bd8128a29aa785ab2de0d044dcdd79436000200000000000000000059'
      const BALANCER_POOL_WETH_WBTC_ID = '0xcf354603a9aebd2ff9f33e1b04246d8ea204ae9500020000000000000000005a'

      const usdcWbtcData = defaultAbiCoder.encode(
        ['address[]', 'bytes32[]'],
        [[WETH], [BALANCER_POOL_WETH_USDC_ID, BALANCER_POOL_WETH_WBTC_ID]]
      )

      const wbtcUsdcData = defaultAbiCoder.encode(
        ['address[]', 'bytes32[]'],
        [[WETH], [BALANCER_POOL_WETH_WBTC_ID, BALANCER_POOL_WETH_USDC_ID]]
      )

      itBatchSwapsCorrectly(source, usdcWbtcData, wbtcUsdcData)
    })
  })

  context('Paraswap V5', () => {
    const source = SOURCE.PARASWAP_V5

    it('swaps correctly USDC-WETH', async () => {
      const amountIn = toUSDC(10e3)
      await usdc.connect(whale).transfer(connector.address, amountIn)

      const { minAmountOut, data } = await loadOrGetParaswapSwapData(CHAIN, connector, usdc, weth, amountIn, SLIPPAGE)
      await connector.connect(whale).swap(source, USDC, WETH, amountIn, minAmountOut, data)

      const swappedBalance = await weth.balanceOf(connector.address)
      const expectedMinAmountOut = await getExpectedMinAmountOut(USDC, WETH, amountIn)
      expect(swappedBalance).to.be.at.least(expectedMinAmountOut)
    })

    it('swaps correctly WETH-USDC', async () => {
      const amountIn = fp(1)
      await weth.connect(whale).transfer(connector.address, amountIn)

      const { minAmountOut, data } = await loadOrGetParaswapSwapData(CHAIN, connector, weth, usdc, amountIn, SLIPPAGE)
      await connector.connect(whale).swap(source, WETH, USDC, amountIn, minAmountOut, data)

      const swappedBalance = await usdc.balanceOf(connector.address)
      const expectedMinAmountOut = await getExpectedMinAmountOut(WETH, USDC, amountIn)
      expect(swappedBalance).to.be.at.least(expectedMinAmountOut)
    })

    it('swaps correctly USDC-WBTC', async () => {
      const amountIn = toUSDC(10e3)
      await usdc.connect(whale).transfer(connector.address, amountIn)

      const { minAmountOut, data } = await loadOrGetParaswapSwapData(CHAIN, connector, usdc, wbtc, amountIn, SLIPPAGE)
      await connector.connect(whale).swap(source, USDC, WBTC, amountIn, minAmountOut, data)

      const swappedBalance = await wbtc.balanceOf(connector.address)
      const expectedMinAmountOut = await getExpectedMinAmountOut(USDC, WBTC, amountIn)
      expect(swappedBalance).to.be.at.least(expectedMinAmountOut)
    })

    it('swaps correctly WTBC-USDC', async () => {
      const amountIn = toWBTC(1)
      await wbtc.connect(whale).transfer(connector.address, amountIn)

      const { minAmountOut, data } = await loadOrGetParaswapSwapData(CHAIN, connector, wbtc, usdc, amountIn, SLIPPAGE)
      await connector.connect(whale).swap(source, WBTC, USDC, amountIn, minAmountOut, data)

      const swappedBalance = await usdc.balanceOf(connector.address)
      const expectedMinAmountOut = await getExpectedMinAmountOut(WBTC, USDC, amountIn)
      expect(swappedBalance).to.be.at.least(expectedMinAmountOut)
    })
  })

  context('1inch V5', () => {
    const source = SOURCE.ONE_INCH_V5

    it('swaps correctly USDC-WETH', async () => {
      const amountIn = fp(10e3).div(1e12) // USDC 6 decimals
      const previousBalance = await weth.balanceOf(connector.address)
      await usdc.connect(whale).transfer(connector.address, amountIn)

      const data = await loadOrGet1inchSwapData(CHAIN, connector, usdc, weth, amountIn, SLIPPAGE)
      await connector.connect(whale).swap(source, USDC, WETH, amountIn, 0, data)

      const currentBalance = await weth.balanceOf(connector.address)
      const expectedMinAmountOut = await getExpectedMinAmountOut(USDC, WETH, amountIn)
      expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
    })

    it('swaps correctly WETH-USDC', async () => {
      const amountIn = fp(1)
      const previousBalance = await usdc.balanceOf(connector.address)
      await weth.connect(whale).transfer(connector.address, amountIn)

      const data = await loadOrGet1inchSwapData(CHAIN, connector, weth, usdc, amountIn, SLIPPAGE)
      await connector.connect(whale).swap(source, WETH, USDC, amountIn, 0, data)

      const currentBalance = await usdc.balanceOf(connector.address)
      const expectedMinAmountOut = await getExpectedMinAmountOut(WETH, USDC, amountIn)
      expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
    })

    it('swaps correctly USDC-WBTC', async () => {
      const amountIn = fp(10e3).div(1e12) // USDC 6 decimals
      const previousBalance = await wbtc.balanceOf(connector.address)
      await usdc.connect(whale).transfer(connector.address, amountIn)

      const data = await loadOrGet1inchSwapData(CHAIN, connector, usdc, wbtc, amountIn, SLIPPAGE)
      await connector.connect(whale).swap(source, USDC, WBTC, amountIn, 0, data)

      const currentBalance = await wbtc.balanceOf(connector.address)
      const expectedMinAmountOut = await getExpectedMinAmountOut(USDC, WBTC, amountIn)
      expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
    })

    it('swaps correctly WTBC-USDC', async () => {
      const amountIn = fp(1).div(1e10) // WBTC 8 decimals
      const previousBalance = await usdc.balanceOf(connector.address)
      await wbtc.connect(whale).transfer(connector.address, amountIn)

      const data = await loadOrGet1inchSwapData(CHAIN, connector, wbtc, usdc, amountIn, SLIPPAGE)
      await connector.connect(whale).swap(source, WBTC, USDC, amountIn, 0, data)

      const currentBalance = await usdc.balanceOf(connector.address)
      const expectedMinAmountOut = await getExpectedMinAmountOut(WBTC, USDC, amountIn)
      expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
    })
  })
})
