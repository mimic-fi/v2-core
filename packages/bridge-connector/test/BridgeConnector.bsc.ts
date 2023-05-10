import { deploy, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'

import { itBehavesLikeAxelarBridgeConnector } from './behaviors/AxelarBridgeConnector.behavior'

/* eslint-disable no-secrets/no-secrets */

const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const WHALE = '0xf977814e90da44bfa03b6295a0616a897441acec'

const AXELAR_GATEWAY = '0x304acf330bbE08d1e512eefaa92F6a57871fD895'

describe('BridgeConnector', () => {
  const SOURCE_CHAIN_ID = 56

  before('create bridge connector', async function () {
    this.connector = await deploy('BridgeConnector', [WBNB, AXELAR_GATEWAY, ZERO_ADDRESS])
  })

  context('Axelar', () => {
    context('WBNB', () => {
      itBehavesLikeAxelarBridgeConnector(SOURCE_CHAIN_ID, WBNB, AXELAR_GATEWAY, WHALE)
    })
  })
})
