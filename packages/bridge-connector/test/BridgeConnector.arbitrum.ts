import { deploy, fp, toUSDC, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'

import { itBehavesLikeAxelarBridgeConnector } from './behaviors/AxelarBridgeConnector.behavior'
import { itBehavesLikeConnextBridgeConnector } from './behaviors/ConnextBridgeConnector.behavior'
import { itBehavesLikeHopBridgeERC20Connector } from './behaviors/HopL2BridgeERC20Connector.behavior'
import { itBehavesLikeHopBridgeNativeConnector } from './behaviors/HopL2BridgeNativeConnector.behavior'

/* eslint-disable no-secrets/no-secrets */

const ARB = '0x912CE59144191C1204E64559FE8253a0e49E6548'
const USDC = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8'
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'

const CONNEXT = '0xEE9deC2712cCE65174B561151701Bf54b99C24C8'
const AXELAR_GATEWAY = '0xe432150cce91c13a887f7D836923d5597adD8E31'

describe('BridgeConnector', () => {
  const SOURCE_CHAIN_ID = 42161

  before('create bridge connector', async function () {
    this.connector = await deploy('BridgeConnector', [WETH, AXELAR_GATEWAY, CONNEXT, ZERO_ADDRESS, ZERO_ADDRESS])
  })

  context('Hop', () => {
    const WHALE = '0xc31e54c7a869b9fcbecc14363cf510d1c41fa443'

    context('USDC', () => {
      const HOP_USDC_AMM = '0xe22D2beDb3Eca35E6397e0C6D62857094aA26F52'

      itBehavesLikeHopBridgeERC20Connector(SOURCE_CHAIN_ID, USDC, HOP_USDC_AMM, WHALE)
    })

    context('WETH', () => {
      const HOP_ETH_AMM = '0x33ceb27b39d2Bb7D2e61F7564d3Df29344020417'

      itBehavesLikeHopBridgeNativeConnector(SOURCE_CHAIN_ID, WETH, HOP_ETH_AMM, WHALE)
    })
  })

  context('Axelar', () => {
    const WHALE = '0xf977814e90da44bfa03b6295a0616a897441acec'

    context('ARB', () => {
      itBehavesLikeAxelarBridgeConnector(SOURCE_CHAIN_ID, ARB, AXELAR_GATEWAY, WHALE)
    })
  })

  context('Connext', () => {
    const WHALE = '0xc31e54c7a869b9fcbecc14363cf510d1c41fa443'

    context('USDC', () => {
      itBehavesLikeConnextBridgeConnector(SOURCE_CHAIN_ID, USDC, toUSDC(300), CONNEXT, WHALE)
    })

    context('WETH', () => {
      itBehavesLikeConnextBridgeConnector(SOURCE_CHAIN_ID, WETH, fp(2), CONNEXT, WHALE)
    })
  })
})
