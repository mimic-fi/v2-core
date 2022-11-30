import { defaultAbiCoder } from '@ethersproject/abi'
import { deploy, fp, impersonate, instanceAt, MAX_UINT256, toUSDC, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

/* eslint-disable no-secrets/no-secrets */

const SOURCE = {
  HOP: 0,
}

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WHALE = '0xf584f8728b874a6a5c7a8d4d387c9aae9172d621'
const HOP_USDC_BRIDGE = '0x3666f603Cc164936C1b87e207F36BEBa4AC5f18a'

describe('BridgeConnector', () => {
  let connector: Contract, usdc: Contract, whale: SignerWithAddress

  before('create bridge connector', async () => {
    connector = await deploy('BridgeConnector', [ZERO_ADDRESS])
  })

  before('load tokens and accounts', async () => {
    usdc = await instanceAt('IERC20', USDC)
    whale = await impersonate(WHALE, fp(100))
  })

  context('Hop', () => {
    const source = SOURCE.HOP

    context('bridge to polygon', () => {
      const chainId = 137
      const amount = toUSDC(3)
      const slippage = fp(0.03)
      const deadline = MAX_UINT256
      const relayer = ZERO_ADDRESS
      const relayerFee = 0

      const data = defaultAbiCoder.encode(
        ['address', 'uint256', 'uint256', 'address', 'uint256'],
        [HOP_USDC_BRIDGE, slippage, deadline, relayer, relayerFee]
      )

      it('should send the tokens to the bridge', async () => {
        const previousSenderBalance = await usdc.balanceOf(whale.address)
        const previousBridgeBalance = await usdc.balanceOf(HOP_USDC_BRIDGE)
        const previousConnectorBalance = await usdc.balanceOf(connector.address)

        await usdc.connect(whale).transfer(connector.address, amount)
        await connector.connect(whale).bridge(source, chainId, USDC, amount, data)

        const currentSenderBalance = await usdc.balanceOf(whale.address)
        expect(currentSenderBalance).to.be.equal(previousSenderBalance.sub(amount))

        const currentBridgeBalance = await usdc.balanceOf(HOP_USDC_BRIDGE)
        expect(currentBridgeBalance).to.be.equal(previousBridgeBalance.add(amount))

        const currentConnectorBalance = await usdc.balanceOf(connector.address)
        expect(currentConnectorBalance).to.be.equal(previousConnectorBalance)
      })
    })
  })
})
