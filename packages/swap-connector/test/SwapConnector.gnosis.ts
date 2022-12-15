import { deploy, fp, pct, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import { BigNumber } from 'ethers'

import { itBehavesLikeHopSwapConnector } from './behaviors/HopSwapConnector.behavior'
import { itBehavesLikeOneInchV5Connector } from './behaviors/OneInchV5Connector.behavior'

/* eslint-disable no-secrets/no-secrets */

const CHAIN = 100

const USDC = '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83'
const WETH = '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1'
const WHALE = '0xb4c575308221caa398e0dd2cdeb6b2f10d7b000a'

const UNISWAP_V2_ROUTER = '0x0000000000000000000000000000000000000000' // Not supported
const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
const BALANCER_V2_VAULT = '0x0000000000000000000000000000000000000000' // Not supported
const PARASWAP_V5_AUGUSTUS = '0x0000000000000000000000000000000000000000' // Not supported
const ONE_INCH_V5_ROUTER = '0x1111111254EEB25477B68fb85Ed929f73A960582'

const CHAINLINK_ETH_USD = '0xa767f745331D267c7751297D982b050c93985627'

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
    await feedsProvider.setPriceFeeds([WETH], [USDC], [CHAINLINK_ETH_USD])

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

  context('1inch V5', () => {
    const SLIPPAGE = 0.01
    const WBTC = ZERO_ADDRESS // WBTC transfers are failing for gnosis chain

    itBehavesLikeOneInchV5Connector(CHAIN, USDC, WETH, WBTC, WHALE, SLIPPAGE)
  })

  context('Hop', () => {
    const SLIPPAGE = 0.02
    const HUSDC = '0x9ec9551d4a1a1593b0ee8124d98590cc71b3b09d'
    const HOP_USDC_SWAP = '0x5c32143c8b198f392d01f8446b754c181224ac26'

    itBehavesLikeHopSwapConnector(CHAIN, USDC, HUSDC, HOP_USDC_SWAP, WHALE, SLIPPAGE)
  })
})
