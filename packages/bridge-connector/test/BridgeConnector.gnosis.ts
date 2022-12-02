import { deploy, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'

import { itBehavesLikeHopBridgeConnector } from './behaviors/HopL2BridgeConnector.behavior'

/* eslint-disable no-secrets/no-secrets */

const USDC = '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83'
const WHALE = '0xc66825c5c04b3c2ccd536d626934e16248a63f68'

describe('BridgeConnector', () => {
  const SOURCE_CHAIN_ID = 100

  before('create bridge connector', async function () {
    this.connector = await deploy('BridgeConnector', [ZERO_ADDRESS])
  })

  context('Hop', () => {
    const HOP_USDC_AMM = '0x76b22b8C1079A44F1211D867D68b1eda76a635A7'

    itBehavesLikeHopBridgeConnector(SOURCE_CHAIN_ID, USDC, HOP_USDC_AMM, WHALE)
  })
})
