import { deploy, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'

import { itBehavesLikeAxelarBridgeConnector } from './behaviors/AxelarBridgeConnector.behavior'

/* eslint-disable no-secrets/no-secrets */

const WFTM = '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83'
const WHALE = '0xe3bd349bdb8203c15426b2d273f57568e658f843'

const AXELAR_GATEWAY = '0x304acf330bbE08d1e512eefaa92F6a57871fD895'

describe('BridgeConnector', () => {
  const SOURCE_CHAIN_ID = 250

  before('create bridge connector', async function () {
    this.connector = await deploy('BridgeConnector', [WFTM, AXELAR_GATEWAY, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS])
  })

  context('Axelar', () => {
    context('WFTM', () => {
      itBehavesLikeAxelarBridgeConnector(SOURCE_CHAIN_ID, WFTM, AXELAR_GATEWAY, WHALE)
    })
  })
})
