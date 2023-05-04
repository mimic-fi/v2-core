import { deploy, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'

import { itBehavesLikeHopBridgeERC20Connector } from './behaviors/HopL2BridgeERC20Connector.behavior'
import { itBehavesLikeHopBridgeNativeConnector } from './behaviors/HopL2BridgeNativeConnector.behavior'

/* eslint-disable no-secrets/no-secrets */

const USDC = '0x7F5c764cBc14f9669B88837ca1490cCa17c31607'
const WETH = '0x4200000000000000000000000000000000000006'
const WHALE = '0x85149247691df622eaf1a8bd0cafd40bc45154a9'

describe('BridgeConnector', () => {
  const SOURCE_CHAIN_ID = 10

  before('create bridge connector', async function () {
    this.connector = await deploy('BridgeConnector', [WETH, ZERO_ADDRESS, ZERO_ADDRESS])
  })

  context('Hop', () => {
    context('USDC', () => {
      const HOP_USDC_AMM = '0x2ad09850b0CA4c7c1B33f5AcD6cBAbCaB5d6e796'

      itBehavesLikeHopBridgeERC20Connector(SOURCE_CHAIN_ID, USDC, HOP_USDC_AMM, WHALE)
    })

    context('WETH', () => {
      const HOP_ETH_AMM = '0x86cA30bEF97fB651b8d866D45503684b90cb3312'

      itBehavesLikeHopBridgeNativeConnector(SOURCE_CHAIN_ID, WETH, HOP_ETH_AMM, WHALE)
    })
  })
})
