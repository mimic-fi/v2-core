import { deploy, fp, pct, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import { BigNumber } from 'ethers'

import { itBehavesLikeBalancerV2Connector } from './behaviors/BalancerV2Connector.behavior'
import { itBehavesLikeOneInchV5Connector } from './behaviors/OneInchV5Connector.behavior'
import { itBehavesLikeParaswapV5Connector } from './behaviors/ParaswapV5Connector.behavior'
import { itBehavesLikeUniswapV2Connector } from './behaviors/UniswapV2Connector.behavior'
import { itBehavesLikeUniswapV3Connector } from './behaviors/UniswapV3Connector.behavior'

/* eslint-disable no-secrets/no-secrets */

const CHAIN = 1

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const WBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
const WHALE = '0xf584f8728b874a6a5c7a8d4d387c9aae9172d621'

const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
const BALANCER_V2_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'
const PARASWAP_V5_AUGUSTUS = '0xdef171fe48cf0115b1d80b88dc8eab59176fee57'
const ONE_INCH_V5_ROUTER = '0x1111111254EEB25477B68fb85Ed929f73A960582'

const CHAINLINK_USDC_ETH = '0x986b5E1e1755e3C2440e960477f25201B0a8bbD4'
const CHAINLINK_WBTC_ETH = '0xdeb288F737066589598e9214E782fa5A8eD689e8'

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
    await feedsProvider.setPriceFeeds([USDC, WBTC], [WETH, WETH], [CHAINLINK_USDC_ETH, CHAINLINK_WBTC_ETH])

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
    const SLIPPAGE = 0.02

    itBehavesLikeUniswapV2Connector(USDC, WETH, WBTC, WHALE, SLIPPAGE)
  })

  context('Uniswap V3', () => {
    const SLIPPAGE = 0.02
    const WETH_USDC_FEE = 3000
    const WETH_WBTC_FEE = 3000

    itBehavesLikeUniswapV3Connector(USDC, WETH, WBTC, WHALE, SLIPPAGE, WETH_USDC_FEE, WETH_WBTC_FEE)
  })

  context('Balancer V2', () => {
    const SLIPPAGE = 0.025
    const WETH_USDC_POOL_ID = '0x96646936b91d6b9d7d0c47c496afbf3d6ec7b6f8000200000000000000000019'
    const WETH_WBTC_POOL_ID = '0xa6f548df93de924d73be7d25dc02554c6bd66db500020000000000000000000e'

    itBehavesLikeBalancerV2Connector(USDC, WETH, WBTC, WHALE, SLIPPAGE, WETH_USDC_POOL_ID, WETH_WBTC_POOL_ID)
  })

  context('Paraswap V5', () => {
    const SLIPPAGE = 0.008

    itBehavesLikeParaswapV5Connector(CHAIN, USDC, WETH, WBTC, WHALE, SLIPPAGE)
  })

  context('1inch V5', () => {
    const SLIPPAGE = 0.015

    itBehavesLikeOneInchV5Connector(CHAIN, USDC, WETH, WBTC, WHALE, SLIPPAGE)
  })

  context('Hop', () => {
    it.skip('not supported')
  })
})
