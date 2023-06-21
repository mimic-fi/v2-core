import { bn, fp, impersonate, instanceAt } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'

import { SOURCES } from '../../src/constants'

export function itBehavesLikeWormholeBridgeConnector(
  sourceChainId: number,
  tokenAddress: string,
  whaleAddress: string
): void {
  let token: Contract, whale: SignerWithAddress

  const source = SOURCES.WORMHOLE

  before('load tokens and accounts', async function () {
    token = await instanceAt('IERC20Metadata', tokenAddress)
    whale = await impersonate(whaleAddress, fp(100))
  })

  context('when the data is encoded properly', async () => {
    let amountIn: BigNumber
    let minAmountOut: BigNumber

    const relayerFee = bn(35000000)
    const data = '0x'

    beforeEach('set amount in and min amount out', async () => {
      const decimals = await token.decimals()
      amountIn = bn(300).mul(bn(10).pow(decimals))
      minAmountOut = amountIn.sub(relayerFee)
    })

    function bridgesProperly(destinationChainId: number) {
      if (destinationChainId != sourceChainId) {
        it('should send the tokens to the gateway', async function () {
          const previousSenderBalance = await token.balanceOf(whale.address)
          const previousTotalSupply = await token.totalSupply()
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

          // check tokens are burnt on the source chain
          const currentTotalSupply = await token.totalSupply()
          expect(currentTotalSupply).to.be.equal(previousTotalSupply.sub(amountIn))

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
        ).to.be.revertedWith('WORMHOLE_UNKNOWN_CHAIN_ID')
      })
    })
  })

  context('when the data is not encoded properly', async () => {
    const data = '0xab'

    it('reverts', async function () {
      await expect(this.connector.bridge(source, 0, tokenAddress, 0, 0, whale.address, data)).to.be.revertedWith(
        'WORMHOLE_INVALID_DATA_LENGTH'
      )
    })
  })
}
