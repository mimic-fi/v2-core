import { deploy, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'

import { itBehavesLikeHopBridgeConnector } from './behaviors/HopL2BridgeConnector.behavior'

/* eslint-disable no-secrets/no-secrets */

const USDC = '0x7F5c764cBc14f9669B88837ca1490cCa17c31607'
const WHALE = '0x489f866c0698c8d6879f5c0f527bc8281046042d'

describe('BridgeConnector', () => {
  const SOURCE_CHAIN_ID = 10

  before('create bridge connector', async function () {
    this.connector = await deploy('BridgeConnector', [ZERO_ADDRESS])
  })

  context('Hop', () => {
    const HOP_USDC_AMM = '0x2ad09850b0CA4c7c1B33f5AcD6cBAbCaB5d6e796'

    itBehavesLikeHopBridgeConnector(SOURCE_CHAIN_ID, USDC, HOP_USDC_AMM, WHALE)
  })
})
