import { deploy, fp, toUSDC, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'

import { itBehavesLikeAxelarBridgeConnector } from './behaviors/AxelarBridgeConnector.behavior'
import { itBehavesLikeConnextBridgeConnector } from './behaviors/ConnextBridgeConnector.behavior'

/* eslint-disable no-secrets/no-secrets */

const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const USDC = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'
const WETH = '0x2170Ed0880ac9A755fd29B2688956BD959F933F8'

const CONNEXT = '0xCd401c10afa37d641d2F594852DA94C700e4F2CE'
const AXELAR_GATEWAY = '0x304acf330bbE08d1e512eefaa92F6a57871fD895'

describe('BridgeConnector', () => {
  const SOURCE_CHAIN_ID = 56

  before('create bridge connector', async function () {
    this.connector = await deploy('BridgeConnector', [WBNB, AXELAR_GATEWAY, CONNEXT, ZERO_ADDRESS, ZERO_ADDRESS])
  })

  context('Axelar', () => {
    const WHALE = '0xf977814e90da44bfa03b6295a0616a897441acec'

    context('WBNB', () => {
      itBehavesLikeAxelarBridgeConnector(SOURCE_CHAIN_ID, WBNB, AXELAR_GATEWAY, WHALE)
    })
  })

  context('Connext', () => {
    const WHALE = '0x8894e0a0c962cb723c1976a4421c95949be2d4e3'

    context('USDC', () => {
      itBehavesLikeConnextBridgeConnector(SOURCE_CHAIN_ID, USDC, toUSDC(300), CONNEXT, WHALE)
    })

    context('WETH', () => {
      itBehavesLikeConnextBridgeConnector(SOURCE_CHAIN_ID, WETH, fp(0.5), CONNEXT, WHALE)
    })
  })
})
