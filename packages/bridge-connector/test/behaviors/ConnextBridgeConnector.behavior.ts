import { fp, impersonate, instanceAt } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { defaultAbiCoder } from 'ethers/lib/utils'

import { SOURCES } from '../../src/constants'

export function itBehavesLikeConnextBridgeConnector(
  sourceChainId: number,
  tokenAddress: string,
  amountIn: BigNumber,
  connextAddress: string,
  whaleAddress: string
): void {
  let token: Contract, whale: SignerWithAddress

  const source = SOURCES.CONNEXT

  before('load tokens and accounts', async function () {
    token = await instanceAt('IERC20Metadata', tokenAddress)
    whale = await impersonate(whaleAddress, fp(100))
  })

  context('when the data is encoded properly', async () => {
    const slippage = 0.005
    const relayerFee = amountIn.div(10)
    const data = defaultAbiCoder.encode(['uint256'], [relayerFee])

    let minAmountOut: BigNumber

    beforeEach('set min amount out', async () => {
      minAmountOut = amountIn.sub(amountIn.mul(fp(slippage)).div(fp(1)))
    })

    function bridgesProperly(destinationChainId: number) {
      if (destinationChainId != sourceChainId) {
        it('should send the tokens to the gateway', async function () {
          const previousSenderBalance = await token.balanceOf(whale.address)
          const previousGatewayBalance = await token.balanceOf(connextAddress)
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

          const amountInAfterFees = amountIn.sub(relayerFee)
          const currentGatewayBalance = await token.balanceOf(connextAddress)
          expect(currentGatewayBalance).to.be.equal(previousGatewayBalance.add(amountInAfterFees))

          const currentConnectorBalance = await token.balanceOf(this.connector.address)
          expect(currentConnectorBalance).to.be.equal(previousConnectorBalance)
        })
      } else {
        it('reverts', async function () {
          await expect(
            this.connector.bridge(source, destinationChainId, tokenAddress, amountIn, minAmountOut, whale.address, data)
          ).to.be.revertedWith('BRIDGE_CONNECTOR_SAME_CHAIN_OP')
        })
      }
    }

    context('bridge to optimism', () => {
      const destinationChainId = 10

      bridgesProperly(destinationChainId)
    })

    context('bridge to polygon', () => {
      const destinationChainId = 137

      bridgesProperly(destinationChainId)
    })

    context('bridge to bsc', () => {
      const destinationChainId = 56

      bridgesProperly(destinationChainId)
    })

    context('bridge to arbitrum', () => {
      const destinationChainId = 42161

      bridgesProperly(destinationChainId)
    })

    context('bridge to gnosis', () => {
      const destinationChainId = 100

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
        ).to.be.revertedWith('CONNEXT_UNKNOWN_CHAIN_ID')
      })
    })
  })

  context('when the data is encoded properly', async () => {
    const data = '0x'

    it('reverts', async function () {
      await expect(this.connector.bridge(source, 0, tokenAddress, 0, 0, whale.address, data)).to.be.revertedWith(
        'CONNEXT_INVALID_DATA_LENGTH'
      )
    })
  })
}
