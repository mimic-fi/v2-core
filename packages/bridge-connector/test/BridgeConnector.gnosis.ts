import { deploy, fp, toUSDC, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'

import { itBehavesLikeConnextBridgeConnector } from './behaviors/ConnextBridgeConnector.behavior'
import { itBehavesLikeHopBridgeERC20Connector } from './behaviors/HopL2BridgeERC20Connector.behavior'
import { itBehavesLikeHopBridgeNativeConnector } from './behaviors/HopL2BridgeNativeConnector.behavior'

/* eslint-disable no-secrets/no-secrets */

const USDC = '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83'
const WXDAI = '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d'

const CONNEXT = '0x5bB83e95f63217CDa6aE3D181BA580Ef377D2109'

describe('BridgeConnector', () => {
  const SOURCE_CHAIN_ID = 100

  before('create bridge connector', async function () {
    this.connector = await deploy('BridgeConnector', [WXDAI, ZERO_ADDRESS, CONNEXT, ZERO_ADDRESS, ZERO_ADDRESS])
  })

  context('Hop', () => {
    context('USDC', () => {
      const WHALE = '0xc66825c5c04b3c2ccd536d626934e16248a63f68'
      const HOP_USDC_AMM = '0x76b22b8C1079A44F1211D867D68b1eda76a635A7'

      itBehavesLikeHopBridgeERC20Connector(SOURCE_CHAIN_ID, USDC, HOP_USDC_AMM, WHALE)
    })

    context('xDAI', () => {
      const WHALE = '0xd4e420bbf00b0f409188b338c5d87df761d6c894'
      const HOP_DAI_AMM = '0x6C928f435d1F3329bABb42d69CCF043e3900EcF1'

      itBehavesLikeHopBridgeNativeConnector(SOURCE_CHAIN_ID, WXDAI, HOP_DAI_AMM, WHALE)
    })
  })

  context('Connext', () => {
    const WHALE = '0xc66825c5c04b3c2ccd536d626934e16248a63f68'

    context('USDC', () => {
      itBehavesLikeConnextBridgeConnector(SOURCE_CHAIN_ID, USDC, toUSDC(300), CONNEXT, WHALE)
    })

    context('xDAI', () => {
      const WHALE = '0xd4e420bbf00b0f409188b338c5d87df761d6c894'

      itBehavesLikeConnextBridgeConnector(SOURCE_CHAIN_ID, WXDAI, fp(2000), CONNEXT, WHALE)
    })
  })
})
