import { bn, fp, impersonate, instanceAt } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'

import { SOURCES } from '../../src/constants'

export function itBehavesLikeAxelarBridgeConnector(
  sourceChainId: number,
  tokenAddress: string,
  gatewayAddress: string,
  whaleAddress: string
): void {
  let token: Contract, whale: SignerWithAddress

  const source = SOURCES.AXELAR

  before('load tokens and accounts', async function () {
    token = await instanceAt('IERC20Metadata', tokenAddress)
    whale = await impersonate(whaleAddress, fp(100))
  })

  context('when the data is encoded properly', async () => {
    let amountIn: BigNumber
    const data = '0x'
    const minAmountOut = 0 // irrelevant for Axelar

    beforeEach('set amount in', async () => {
      const decimals = await token.decimals()
      amountIn = bn(300).mul(bn(10).pow(decimals))
    })

    function bridgesProperly(destinationChainId: number) {
      if (destinationChainId != sourceChainId) {
        it('should send the tokens to the gateway', async function () {
          const previousSenderBalance = await token.balanceOf(whale.address)
          const previousGatewayBalance = await token.balanceOf(gatewayAddress)
          const previousConnectorBalance = await token.balanceOf(this.connector.address)

          await token.connect(whale).transfer(this.connector.address, amountIn)
          await this.connector.bridge(
            source,
            destinationChainId,
            tokenAddress,
            amountIn,
            minAmountOut,
            whale.address,
            data
          )

          const currentSenderBalance = await token.balanceOf(whale.address)
          expect(currentSenderBalance).to.be.equal(previousSenderBalance.sub(amountIn))

          const currentGatewayBalance = await token.balanceOf(gatewayAddress)
          expect(currentGatewayBalance).to.be.equal(previousGatewayBalance.add(amountIn))

          const currentConnectorBalance = await token.balanceOf(this.connector.address)
          expect(currentConnectorBalance).to.be.equal(previousConnectorBalance)
        })
      } else {
        it('reverts', async function () {
          await expect(
            this.connector.bridge(source, destinationChainId, tokenAddress, amountIn, minAmountOut, whale.address, '0x')
          ).to.be.revertedWith('BRIDGE_CONNECTOR_SAME_CHAIN_OP')
        })
      }
    }

    context('bridge to polygon', () => {
      const destinationChainId = 137

      bridgesProperly(destinationChainId)
    })

    context('bridge to bsc', () => {
      const destinationChainId = 56

      bridgesProperly(destinationChainId)
    })

    context('bridge to fantom', () => {
      const destinationChainId = 250

      bridgesProperly(destinationChainId)
    })

    context('bridge to arbitrum', () => {
      const destinationChainId = 42161

      bridgesProperly(destinationChainId)
    })

    context('bridge to avalanche', () => {
      const destinationChainId = 43114

      bridgesProperly(destinationChainId)
    })

    context('bridge to mainnet', () => {
      const destinationChainId = 1

      bridgesProperly(destinationChainId)
    })

    context('bridge to goerli', () => {
      const destinationChainId = 5

      it('reverts', async function () {
        await expect(
          this.connector.bridge(source, destinationChainId, tokenAddress, amountIn, minAmountOut, whale.address, data)
        ).to.be.revertedWith('AXELAR_UNKNOWN_CHAIN_ID')
      })
    })
  })

  context('when the data is not encoded properly', async () => {
    const data = '0xab'

    it('reverts', async function () {
      await expect(this.connector.bridge(source, 0, tokenAddress, 0, 0, whale.address, data)).to.be.revertedWith(
        'AXELAR_INVALID_DATA_LENGTH'
      )
    })
  })
}
