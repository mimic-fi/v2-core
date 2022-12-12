import { deploy, fp, impersonate, instanceAt, pct, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import { BigNumber } from 'ethers'

import { itBehavesLikeBalancerV2Connector } from './behaviors/BalancerV2Connector.behavior'
import { itBehavesLikeHopSwapConnector } from './behaviors/HopSwapConnector.behavior'
import { itBehavesLikeOneInchV5Connector } from './behaviors/OneInchV5Connector.behavior'
import { itBehavesLikeParaswapV5Connector } from './behaviors/ParaswapV5Connector.behavior'
import { itBehavesLikeUniswapV3Connector } from './behaviors/UniswapV3Connector.behavior'

/* eslint-disable no-secrets/no-secrets */

const CHAIN = 42161

const USDC = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8'
const WETH = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'
const WBTC = '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f'
const WHALE = '0x7B7B957c284C2C227C980d6E2F804311947b84d0'
const WHALE_WITH_WETH = '0x2990d87e823d3cca83683207dcb2d5660debf376'

const UNISWAP_V2_ROUTER = '0x0000000000000000000000000000000000000000' // No support
const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
const BALANCER_V2_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'
const PARASWAP_V5_AUGUSTUS = '0xdef171fe48cf0115b1d80b88dc8eab59176fee57'
const ONE_INCH_V5_ROUTER = '0x1111111254EEB25477B68fb85Ed929f73A960582'

const CHAINLINK_ETH_USD = '0x639fe6ab55c921f74e7fac1ee960c0b6293ba612'
const CHAINLINK_BTC_USD = '0x6ce185860a4963106506c203335a2910413708e9'

describe('SwapConnector', () => {
  before('feed whale with weth', async function () {
    const whaleWithWeth = await impersonate(WHALE_WITH_WETH, fp(10))
    const weth = await instanceAt('IERC20', WETH)
    await weth.connect(whaleWithWeth).transfer(WHALE, fp(100))
  })

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
    await feedsProvider.setPriceFeeds([WETH, WBTC], [USDC, USDC], [CHAINLINK_ETH_USD, CHAINLINK_BTC_USD])

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
    it.skip('not supported')
  })

  context('Uniswap V3', () => {
    const SLIPPAGE = 0.02
    const WETH_USDC_FEE = 3000
    const WETH_WBTC_FEE = 3000

    itBehavesLikeUniswapV3Connector(USDC, WETH, WBTC, WHALE, SLIPPAGE, WETH_USDC_FEE, WETH_WBTC_FEE)
  })

  context('Balancer V2', () => {
    const SLIPPAGE = 0.05
    const WETH_USDC_POOL_ID = '0x64541216bafffeec8ea535bb71fbc927831d0595000100000000000000000002'
    const WETH_WBTC_POOL_ID = '0x64541216bafffeec8ea535bb71fbc927831d0595000100000000000000000002'

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
    const SLIPPAGE = 0.01
    const HUSDC = '0x0ce6c85cf43553de10fc56ceca0aef6ff0dd444d'
    const HOP_USDC_SWAP = '0x10541b07d8ad2647dc6cd67abd4c03575dade261'

    itBehavesLikeHopSwapConnector(CHAIN, USDC, HUSDC, HOP_USDC_SWAP, WHALE, SLIPPAGE)
  })
})
