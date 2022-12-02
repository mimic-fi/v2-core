import { deploy, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'

import { itBehavesLikeHopBridgeConnector } from './behaviors/HopL2BridgeConnector.behavior'

/* eslint-disable no-secrets/no-secrets */

const USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const WHALE = '0xa8f49d90b24d6a007e5f47bf86d122a9f3211734'

describe('BridgeConnector', () => {
  const SOURCE_CHAIN_ID = 137

  before('create bridge connector', async function () {
    this.connector = await deploy('BridgeConnector', [ZERO_ADDRESS])
  })

  context('Hop', () => {
    const HOP_USDC_AMM = '0x76b22b8C1079A44F1211D867D68b1eda76a635A7'

    itBehavesLikeHopBridgeConnector(SOURCE_CHAIN_ID, USDC, HOP_USDC_AMM, WHALE)
  })
})
