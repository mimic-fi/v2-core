import { deploy, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'

import { itBehavesLikeAxelarBridgeConnector } from './behaviors/AxelarBridgeConnector.behavior'
import { itBehavesLikeHopBridgeERC20Connector } from './behaviors/HopL2BridgeERC20Connector.behavior'
import { itBehavesLikeHopBridgeNativeConnector } from './behaviors/HopL2BridgeNativeConnector.behavior'

/* eslint-disable no-secrets/no-secrets */

const USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const WMATIC = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
const WHALE = '0xfffbcd322ceace527c8ec6da8de2461c6d9d4e6e'

const AXELAR_GATEWAY = '0x6f015F16De9fC8791b234eF68D486d2bF203FBA8'

describe('BridgeConnector', () => {
  const SOURCE_CHAIN_ID = 137

  before('create bridge connector', async function () {
    this.connector = await deploy('BridgeConnector', [WMATIC, AXELAR_GATEWAY, ZERO_ADDRESS])
  })

  context('Hop', () => {
    context('USDC', () => {
      const HOP_USDC_AMM = '0x76b22b8C1079A44F1211D867D68b1eda76a635A7'

      itBehavesLikeHopBridgeERC20Connector(SOURCE_CHAIN_ID, USDC, HOP_USDC_AMM, WHALE)
    })

    context('WMATIC', () => {
      const HOP_MATIC_AMM = '0x884d1Aa15F9957E1aEAA86a82a72e49Bc2bfCbe3'
      const ignoreChains = [10, 42161] // optimism & arbitrum

      itBehavesLikeHopBridgeNativeConnector(SOURCE_CHAIN_ID, WMATIC, HOP_MATIC_AMM, WHALE, ignoreChains)
    })
  })

  context('Axelar', () => {
    context('USDC', () => {
      itBehavesLikeAxelarBridgeConnector(SOURCE_CHAIN_ID, USDC, AXELAR_GATEWAY, WHALE)
    })

    context('WMATIC', () => {
      itBehavesLikeAxelarBridgeConnector(SOURCE_CHAIN_ID, WMATIC, AXELAR_GATEWAY, WHALE)
    })
  })
})
