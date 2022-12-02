import { deploy, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'

import { itBehavesLikeHopBridgeConnector } from './behaviors/HopL2BridgeConnector.behavior'

/* eslint-disable no-secrets/no-secrets */

const USDC = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8'
const WHALE = '0x62383739d68dd0f844103db8dfb05a7eded5bbe6'

describe('BridgeConnector', () => {
  const SOURCE_CHAIN_ID = 42161

  before('create bridge connector', async function () {
    this.connector = await deploy('BridgeConnector', [ZERO_ADDRESS])
  })

  context('Hop', () => {
    const HOP_USDC_AMM = '0xe22D2beDb3Eca35E6397e0C6D62857094aA26F52'

    itBehavesLikeHopBridgeConnector(SOURCE_CHAIN_ID, USDC, HOP_USDC_AMM, WHALE)
  })
})
