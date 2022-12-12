import { defaultAbiCoder } from '@ethersproject/abi'
import { fp, impersonate, instanceAt, MAX_UINT256, toUSDC } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

import { getHopBonderFee } from '../../src/hop'

export function itBehavesLikeHopBridgeConnector(
  sourceChainId: number,
  usdcAddress: string,
  usdcAmmAddress: string,
  whaleAddress: string
): void {
  let usdc: Contract, whale: SignerWithAddress, amm: Contract, hUsdc: Contract, ammExchangeAddress: string

  const SOURCE = 0 // HOP

  before('load tokens and accounts', async function () {
    usdc = await instanceAt('IERC20Metadata', usdcAddress)
    whale = await impersonate(whaleAddress, fp(100))
  })

  beforeEach('load hop AMM', async function () {
    amm = await instanceAt('IHopL2AMM', usdcAmmAddress)
    hUsdc = await instanceAt('IERC20', await amm.hToken())
    ammExchangeAddress = await amm.exchangeAddress()
  })

  function itBridgesFromL2Properly(destinationChainId: number) {
    const slippage = 0.01
    const deadline = MAX_UINT256
    const amountIn = toUSDC(300)
    const minAmountOut = amountIn.sub(amountIn.mul(fp(slippage)).div(fp(1)))

    if (destinationChainId != sourceChainId) {
      context('when the data is encoded properly', async () => {
        let data: string

        beforeEach('estimate bonder fee and compute data', async function () {
          const bonderFee = await getHopBonderFee(sourceChainId, destinationChainId, usdc, amountIn, slippage)
          data =
            destinationChainId == 1
              ? defaultAbiCoder.encode(['address', 'uint256'], [usdcAmmAddress, bonderFee])
              : defaultAbiCoder.encode(['address', 'uint256', 'uint256'], [usdcAmmAddress, bonderFee, deadline])
        })

        it('should send the canonical tokens to the exchange', async function () {
          const previousSenderBalance = await usdc.balanceOf(whale.address)
          const previousExchangeBalance = await usdc.balanceOf(ammExchangeAddress)
          const previousConnectorBalance = await usdc.balanceOf(this.connector.address)

          await usdc.connect(whale).transfer(this.connector.address, amountIn)
          await this.connector
            .connect(whale)
            .bridge(SOURCE, destinationChainId, usdcAddress, amountIn, minAmountOut, data)

          const currentSenderBalance = await usdc.balanceOf(whale.address)
          expect(currentSenderBalance).to.be.equal(previousSenderBalance.sub(amountIn))

          const currentExchangeBalance = await usdc.balanceOf(ammExchangeAddress)
          expect(currentExchangeBalance).to.be.equal(previousExchangeBalance.add(amountIn))

          const currentConnectorBalance = await usdc.balanceOf(this.connector.address)
          expect(currentConnectorBalance).to.be.equal(previousConnectorBalance)
        })

        it('should burn at least the requested hop tokens', async function () {
          const previousHopUsdcSupply = await hUsdc.totalSupply()

          await usdc.connect(whale).transfer(this.connector.address, amountIn)
          await this.connector
            .connect(whale)
            .bridge(SOURCE, destinationChainId, usdcAddress, amountIn, minAmountOut, data)

          const currentHopUsdcSupply = await hUsdc.totalSupply()
          const burnedAmount = previousHopUsdcSupply.sub(currentHopUsdcSupply)
          expect(burnedAmount).to.be.at.least(minAmountOut)
        })

        it('does not affect the canonical token balance of the amm', async function () {
          const previousAmmUsdcBalance = await usdc.balanceOf(usdcAmmAddress)

          await usdc.connect(whale).transfer(this.connector.address, amountIn)
          await this.connector
            .connect(whale)
            .bridge(SOURCE, destinationChainId, usdcAddress, amountIn, minAmountOut, data)

          const currentAmmUsdcBalance = await usdc.balanceOf(usdcAmmAddress)
          expect(currentAmmUsdcBalance).to.be.equal(previousAmmUsdcBalance)
        })
      })

      context('when the data is not encoded properly', async () => {
        const data = '0x'
        const reason = destinationChainId == 1 ? 'HOP_INVALID_L2_L1_DATA_LENGTH' : 'HOP_INVALID_L2_L2_DATA_LENGTH'

        it('reverts', async function () {
          await expect(
            this.connector.bridge(SOURCE, destinationChainId, usdcAddress, amountIn, minAmountOut, data)
          ).to.be.revertedWith(reason)
        })
      })
    } else {
      it('reverts', async function () {
        await expect(
          this.connector.bridge(SOURCE, destinationChainId, usdcAddress, amountIn, minAmountOut, '0x')
        ).to.be.revertedWith('BRIDGE_CONNECTOR_SAME_CHAIN_OP')
      })
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
      await expect(this.connector.bridge(SOURCE, destinationChainId, usdcAddress, 0, '0x')).to.be.reverted
    })
  })
}
