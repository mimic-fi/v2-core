import { deploy, fp, pct, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import { BigNumber } from 'ethers'

import { itBehavesLikeBalancerV2Connector } from './behaviors/BalancerV2Connector.behavior'
import { itBehavesLikeHopSwapConnector } from './behaviors/HopSwapConnector.behavior'
import { itBehavesLikeOneInchV5Connector } from './behaviors/OneInchV5Connector.behavior'
import { itBehavesLikeParaswapV5Connector } from './behaviors/ParaswapV5Connector.behavior'
import { itBehavesLikeUniswapV2Connector } from './behaviors/UniswapV2Connector.behavior'
import { itBehavesLikeUniswapV3Connector } from './behaviors/UniswapV3Connector.behavior'

/* eslint-disable no-secrets/no-secrets */

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

const CHAINLINK_USDC_ETH = '0xefb7e6be8356ccc6827799b6a7348ee674a80eae'
const CHAINLINK_WBTC_USD = '0xc907e116054ad103354f2d350fd2514433d57f6f'

describe('SwapConnector', () => {
  before('create swap connector', async function () {
    this.connector = await deploy('SwapConnector', [
      UNISWAP_V2_ROUTER,
      UNISWAP_V3_ROUTER,
      BALANCER_V2_VAULT,
      PARASWAP_V5_AUGUSTUS,
      ONE_INCH_V5_ROUTER,
      ZERO_ADDRESS,
    ])
  })

  before('create estimate amount out function', async function () {
    const priceOracle = await deploy(
      '@mimic-fi/v2-price-oracle/artifacts/contracts/oracle/PriceOracle.sol/PriceOracle',
      [WETH, ZERO_ADDRESS]
    )
    const feedsProvider = await deploy(
      '@mimic-fi/v2-price-oracle/artifacts/contracts/feeds/PriceFeedProvider.sol/PriceFeedProvider'
    )
    await feedsProvider.setPriceFeeds([USDC, WBTC], [WETH, USDC], [CHAINLINK_USDC_ETH, CHAINLINK_WBTC_USD])

    this.getExpectedMinAmountOut = async (
      tokenIn: string,
      tokenOut: string,
      amountIn: BigNumber,
      slippage: number
    ): Promise<BigNumber> => {
      const price = await priceOracle.getPrice(feedsProvider.address, tokenIn, tokenOut)
      const expectedAmountOut = price.mul(amountIn).div(fp(1))
      return expectedAmountOut.sub(pct(expectedAmountOut, slippage))
    }
  })

  context('Uniswap V2', () => {
    const SLIPPAGE = 0.03

    itBehavesLikeUniswapV2Connector(USDC, WETH, WBTC, WHALE, SLIPPAGE)
  })

  context('Uniswap V3', () => {
    const SLIPPAGE = 0.02
    const WETH_USDC_FEE = 3000
    const WETH_WBTC_FEE = 3000

    itBehavesLikeUniswapV3Connector(USDC, WETH, WBTC, WHALE, SLIPPAGE, WETH_USDC_FEE, WETH_WBTC_FEE)
  })

  context('Balancer V2', () => {
    const SLIPPAGE = 0.5
    const WETH_USDC_POOL_ID = '0x10f21c9bd8128a29aa785ab2de0d044dcdd79436000200000000000000000059'
    const WETH_WBTC_POOL_ID = '0xcf354603a9aebd2ff9f33e1b04246d8ea204ae9500020000000000000000005a'

    itBehavesLikeBalancerV2Connector(USDC, WETH, WBTC, WHALE, SLIPPAGE, WETH_USDC_POOL_ID, WETH_WBTC_POOL_ID)
  })

  context('Paraswap V5', () => {
    const SLIPPAGE = 0.01

    itBehavesLikeParaswapV5Connector(CHAIN, USDC, WETH, WBTC, WHALE, SLIPPAGE)
  })

  context('1inch V5', () => {
    const SLIPPAGE = 0.01

    itBehavesLikeOneInchV5Connector(CHAIN, USDC, WETH, WBTC, WHALE, SLIPPAGE)
  })

  context('Hop', () => {
    const SLIPPAGE = 0.02
    const HUSDC = '0x9ec9551d4a1a1593b0ee8124d98590cc71b3b09d'
    const HOP_USDC_SWAP = '0x5c32143c8b198f392d01f8446b754c181224ac26'

    itBehavesLikeHopSwapConnector(CHAIN, USDC, HUSDC, HOP_USDC_SWAP, WHALE, SLIPPAGE)
  })
})
