import { deploy, fp, pct, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import { BigNumber } from 'ethers'

import { itBehavesLikeHopSwapConnector } from './behaviors/HopSwapConnector.behavior'
import { itBehavesLikeOneInchV5Connector } from './behaviors/OneInchV5Connector.behavior'
import { itBehavesLikeParaswapV5Connector } from './behaviors/ParaswapV5Connector.behavior'
import { itBehavesLikeUniswapV3Connector } from './behaviors/UniswapV3Connector.behavior'

/* eslint-disable no-secrets/no-secrets */

const CHAIN = 10

const USDC = '0x7F5c764cBc14f9669B88837ca1490cCa17c31607'
const WETH = '0x4200000000000000000000000000000000000006'
const WBTC = '0x68f180fcce6836688e9084f035309e29bf0a2095'
const WHALE = '0xd9a1ed9aac149bf9bd655f9b9ddecf9bd04316b3'

const UNISWAP_V2_ROUTER = '0x0000000000000000000000000000000000000000' // No support
const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
const BALANCER_V2_VAULT = '0x0000000000000000000000000000000000000000' // No support
const PARASWAP_V5_AUGUSTUS = '0xdef171fe48cf0115b1d80b88dc8eab59176fee57'
const ONE_INCH_V5_ROUTER = '0x1111111254EEB25477B68fb85Ed929f73A960582'

const CHAINLINK_ETH_USD = '0x13e3ee699d1909e989722e753853ae30b17e08c5'
const CHAINLINK_BTC_USD = '0xd702dd976fb76fffc2d3963d037dfdae5b04e593'

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
    it.skip('not supported')
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
    const HUSDC = '0x25d8039bb044dc227f741a9e381ca4ceae2e6ae8'
    const HOP_USDC_SWAP = '0x3c0ffaca566fccfd9cc95139fef6cba143795963'

    itBehavesLikeHopSwapConnector(CHAIN, USDC, HUSDC, HOP_USDC_SWAP, WHALE, SLIPPAGE)
  })
})
