import { defaultAbiCoder } from '@ethersproject/abi'
import { fp, impersonate, instanceAt, MAX_UINT256 } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

import { SOURCES } from '../../src/constants'
import { getHopBonderFee } from '../../src/hop'

export function itBehavesLikeHopBridgeNativeConnector(
  sourceChainId: number,
  wrappedNativeTokenAddress: string,
  nativeTokenAmmAddress: string,
  whaleAddress: string,
  ignoreChains: number[] = []
): void {
  let whale: SignerWithAddress
  let wrappedNativeToken: Contract, amm: Contract, hToken: Contract, ammExchangeAddress: string

  const source = SOURCES.HOP

  before('load tokens and accounts', async function () {
    wrappedNativeToken = await instanceAt('IERC20Metadata', wrappedNativeTokenAddress)
    whale = await impersonate(whaleAddress, fp(100))
  })

  beforeEach('load hop AMM', async function () {
    amm = await instanceAt('IHopL2AMM', nativeTokenAmmAddress)
    hToken = await instanceAt('IERC20', await amm.hToken())
    ammExchangeAddress = await amm.exchangeAddress()
  })

  function itBridgesFromL2Properly(destinationChainId: number) {
    const slippage = 0.01
    const deadline = MAX_UINT256
    const amountIn = sourceChainId === 137 || sourceChainId === 100 ? fp(100) : fp(4)
    const minAmountOut = amountIn.sub(amountIn.mul(fp(slippage)).div(fp(1)))

    if (!ignoreChains.includes(destinationChainId)) {
      if (destinationChainId != sourceChainId) {
        context('when the data is encoded properly', async () => {
          let data: string

          beforeEach('estimate bonder fee and compute data', async function () {
            const bonderFee = await getHopBonderFee(
              sourceChainId,
              destinationChainId,
              wrappedNativeToken,
              amountIn,
              slippage
            )
            data =
              destinationChainId == 1
                ? defaultAbiCoder.encode(['address', 'uint256'], [nativeTokenAmmAddress, bonderFee])
                : defaultAbiCoder.encode(
                    ['address', 'uint256', 'uint256'],
                    [nativeTokenAmmAddress, bonderFee, deadline]
                  )
          })

          it('should send the canonical tokens to the exchange', async function () {
            const previousSenderBalance = await wrappedNativeToken.balanceOf(whale.address)
            const previousExchangeBalance = await wrappedNativeToken.balanceOf(ammExchangeAddress)
            const previousConnectorBalance = await wrappedNativeToken.balanceOf(this.connector.address)

            await wrappedNativeToken.connect(whale).transfer(this.connector.address, amountIn)
            await this.connector
              .connect(whale)
              .bridge(
                source,
                destinationChainId,
                wrappedNativeTokenAddress,
                amountIn,
                minAmountOut,
                whale.address,
                data
              )

            const currentSenderBalance = await wrappedNativeToken.balanceOf(whale.address)
            expect(currentSenderBalance).to.be.equal(previousSenderBalance.sub(amountIn))

            const currentExchangeBalance = await wrappedNativeToken.balanceOf(ammExchangeAddress)
            expect(currentExchangeBalance).to.be.equal(previousExchangeBalance.add(amountIn))

            const currentConnectorBalance = await wrappedNativeToken.balanceOf(this.connector.address)
            expect(currentConnectorBalance).to.be.equal(previousConnectorBalance)
          })

          it('should burn at least the requested hop tokens', async function () {
            const previousHopTokenSupply = await hToken.totalSupply()

            await wrappedNativeToken.connect(whale).transfer(this.connector.address, amountIn)
            await this.connector
              .connect(whale)
              .bridge(
                source,
                destinationChainId,
                wrappedNativeTokenAddress,
                amountIn,
                minAmountOut,
                whale.address,
                data
              )

            const currentHopTokenSupply = await hToken.totalSupply()
            const burnedAmount = previousHopTokenSupply.sub(currentHopTokenSupply)
            expect(burnedAmount).to.be.at.least(minAmountOut)
          })

          it('does not affect the canonical token balance of the amm', async function () {
            const previousAmmTokenBalance = await wrappedNativeToken.balanceOf(nativeTokenAmmAddress)

            await wrappedNativeToken.connect(whale).transfer(this.connector.address, amountIn)
            await this.connector
              .connect(whale)
              .bridge(
                source,
                destinationChainId,
                wrappedNativeTokenAddress,
                amountIn,
                minAmountOut,
                whale.address,
                data
              )

            const currentAmmTokenBalance = await wrappedNativeToken.balanceOf(nativeTokenAmmAddress)
            expect(currentAmmTokenBalance).to.be.equal(previousAmmTokenBalance)
          })
        })

        context('when the data is not encoded properly', async () => {
          const data = '0x'
          const reason = destinationChainId == 1 ? 'HOP_INVALID_L2_L1_DATA_LENGTH' : 'HOP_INVALID_L2_L2_DATA_LENGTH'

          it('reverts', async function () {
            await expect(
              this.connector.bridge(
                source,
                destinationChainId,
                wrappedNativeTokenAddress,
                amountIn,
                minAmountOut,
                whale.address,
                data
              )
            ).to.be.revertedWith(reason)
          })
        })
      } else {
        it('reverts', async function () {
          await expect(
            this.connector.bridge(
              source,
              destinationChainId,
              wrappedNativeTokenAddress,
              amountIn,
              minAmountOut,
              whale.address,
              '0x'
            )
          ).to.be.revertedWith('BRIDGE_CONNECTOR_SAME_CHAIN_OP')
        })
      }
    }
  }

  context('bridge to optimism', function () {
    const destinationChainId = 10

    itBridgesFromL2Properly(destinationChainId)
  })

  context('bridge to polygon', function () {
    const destinationChainId = 137

    itBridgesFromL2Properly(destinationChainId)
  })

  context('bridge to gnosis', function () {
    const destinationChainId = 100

    itBridgesFromL2Properly(destinationChainId)
  })

  context('bridge to arbitrum', function () {
    const destinationChainId = 42161

    itBridgesFromL2Properly(destinationChainId)
  })

  context('bridge to mainnet', function () {
    const destinationChainId = 1

    itBridgesFromL2Properly(destinationChainId)
  })

  context('bridge to goerli', function () {
    const destinationChainId = 5

    it('reverts', async function () {
      await expect(
        this.connector.bridge(source, destinationChainId, wrappedNativeTokenAddress, 0, whale.address, '0x')
      ).to.be.reverted
    })
  })
}
