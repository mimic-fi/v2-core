import { deploy, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'

import { itBehavesLikeAxelarBridgeConnector } from './behaviors/AxelarBridgeConnector.behavior'

/* eslint-disable no-secrets/no-secrets */

const WAVAX = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7'
const USDC = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E'
const WHALE = '0xbbff2a8ec8d702e61faaccf7cf705968bb6a5bab'

const AXELAR_GATEWAY = '0x5029C0EFf6C34351a0CEc334542cDb22c7928f78'

describe('BridgeConnector', () => {
  const SOURCE_CHAIN_ID = 43114

  before('create bridge connector', async function () {
    this.connector = await deploy('BridgeConnector', [WAVAX, AXELAR_GATEWAY, ZERO_ADDRESS, ZERO_ADDRESS])
  })

  context('Axelar', () => {
    context('WAVAX', () => {
      itBehavesLikeAxelarBridgeConnector(SOURCE_CHAIN_ID, WAVAX, AXELAR_GATEWAY, WHALE)
    })

    context('USDC', () => {
      itBehavesLikeAxelarBridgeConnector(SOURCE_CHAIN_ID, USDC, AXELAR_GATEWAY, WHALE)
    })
  })
})
