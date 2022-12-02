import { defaultAbiCoder } from '@ethersproject/abi'
import { fp, impersonate, instanceAt, MAX_UINT256, toUSDC } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'

import { getHopBonderFee } from '../../src/hop'

export function itBehavesLikeHopBridgeConnector(
  sourceChainId: number,
  usdcAddress: string,
  usdcAmmAddress: string,
  whaleAddress: string
): void {
  let usdc: Contract, whale: SignerWithAddress, amm: Contract, hUsdc: Contract, ammExchangeAddress: string
  let data: string, bonderFee: BigNumber

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

  function itBridgesToL2Properly(destinationChainId: number) {
    const amount = toUSDC(300)
    const slippage = 0.01
    const deadline = MAX_UINT256

    if (destinationChainId == sourceChainId) {
      it('reverts', async function () {
        await expect(this.connector.bridge(SOURCE, destinationChainId, usdcAddress, amount, '0x')).to.be.revertedWith(
          'BRIDGE_CONNECTOR_SAME_CHAIN_OP'
        )
      })
    } else {
      beforeEach('estimate bonder fee and compute data', async function () {
        bonderFee = await getHopBonderFee(sourceChainId, destinationChainId, usdc, amount, slippage)
        data = defaultAbiCoder.encode(
          ['address', 'uint256', 'uint256', 'uint256'],
          [usdcAmmAddress, bonderFee, fp(slippage), deadline]
        )
      })

      it('should send the canonical tokens to the exchange', async function () {
        const previousSenderBalance = await usdc.balanceOf(whale.address)
        const previousExchangeBalance = await usdc.balanceOf(ammExchangeAddress)
        const previousConnectorBalance = await usdc.balanceOf(this.connector.address)

        await usdc.connect(whale).transfer(this.connector.address, amount)
        await this.connector.connect(whale).bridge(SOURCE, destinationChainId, usdcAddress, amount, data)

        const currentSenderBalance = await usdc.balanceOf(whale.address)
        expect(currentSenderBalance).to.be.equal(previousSenderBalance.sub(amount))

        const currentExchangeBalance = await usdc.balanceOf(ammExchangeAddress)
        expect(currentExchangeBalance).to.be.equal(previousExchangeBalance.add(amount))

        const currentConnectorBalance = await usdc.balanceOf(this.connector.address)
        expect(currentConnectorBalance).to.be.equal(previousConnectorBalance)
      })

      it('should burn at least the requested hop tokens', async function () {
        const previousBridgeHopUsdcBalance = await hUsdc.totalSupply()

        await usdc.connect(whale).transfer(this.connector.address, amount)
        await this.connector.connect(whale).bridge(SOURCE, destinationChainId, usdcAddress, amount, data)

        const minAmount = amount.sub(amount.mul(fp(slippage)).div(fp(1)))
        const burnedAmount = previousBridgeHopUsdcBalance.sub(await hUsdc.totalSupply())
        expect(burnedAmount).to.be.at.least(minAmount)
      })

      it('does not affect the canonical token balance of the amm', async function () {
        const previousAmmUsdcBalance = await usdc.balanceOf(usdcAmmAddress)

        await usdc.connect(whale).transfer(this.connector.address, amount)
        await this.connector.connect(whale).bridge(SOURCE, destinationChainId, usdcAddress, amount, data)

        const currentAmmUsdcBalance = await usdc.balanceOf(usdcAmmAddress)
        expect(currentAmmUsdcBalance).to.be.equal(previousAmmUsdcBalance)
      })
    }
  }

  context('bridge to optimism', function () {
    const destinationChainId = 10

    itBridgesToL2Properly(destinationChainId)
  })

  context('bridge to polygon', function () {
    const destinationChainId = 137

    itBridgesToL2Properly(destinationChainId)
  })

  context('bridge to gnosis', function () {
    const destinationChainId = 100

    itBridgesToL2Properly(destinationChainId)
  })

  context('bridge to arbitrum', function () {
    const destinationChainId = 42161

    itBridgesToL2Properly(destinationChainId)
  })

  context('bridge to mainnet', function () {
    const destinationChainId = 1
    const amount = toUSDC(300)
    const slippage = 0.03

    beforeEach('estimate bonder fee and compute data', async function () {
      bonderFee = await getHopBonderFee(sourceChainId, destinationChainId, usdc, amount, slippage)
      data = defaultAbiCoder.encode(['address', 'uint256', 'uint256'], [usdcAmmAddress, bonderFee, fp(slippage)])
    })

    it('should send the canonical tokens to the exchange', async function () {
      const previousSenderBalance = await usdc.balanceOf(whale.address)
      const previousExchangeBalance = await usdc.balanceOf(ammExchangeAddress)
      const previousConnectorBalance = await usdc.balanceOf(this.connector.address)

      await usdc.connect(whale).transfer(this.connector.address, amount)
      await this.connector.connect(whale).bridge(SOURCE, destinationChainId, usdcAddress, amount, data)

      const currentSenderBalance = await usdc.balanceOf(whale.address)
      expect(currentSenderBalance).to.be.equal(previousSenderBalance.sub(amount))

      const currentExchangeBalance = await usdc.balanceOf(ammExchangeAddress)
      expect(currentExchangeBalance).to.be.equal(previousExchangeBalance.add(amount))

      const currentConnectorBalance = await usdc.balanceOf(this.connector.address)
      expect(currentConnectorBalance).to.be.equal(previousConnectorBalance)
    })

    it('should burn at least the requested hop tokens', async function () {
      const previousBridgeHopUsdcBalance = await hUsdc.totalSupply()

      await usdc.connect(whale).transfer(this.connector.address, amount)
      await this.connector.connect(whale).bridge(SOURCE, destinationChainId, usdcAddress, amount, data)

      const minAmount = amount.sub(amount.mul(fp(slippage)).div(fp(1)))
      const burnedAmount = previousBridgeHopUsdcBalance.sub(await hUsdc.totalSupply())
      expect(burnedAmount).to.be.at.least(minAmount)
    })

    it('does not affect the canonical token balance of the amm', async function () {
      const previousAmmUsdcBalance = await usdc.balanceOf(usdcAmmAddress)

      await usdc.connect(whale).transfer(this.connector.address, amount)
      await this.connector.connect(whale).bridge(SOURCE, destinationChainId, usdcAddress, amount, data)

      const currentAmmUsdcBalance = await usdc.balanceOf(usdcAmmAddress)
      expect(currentAmmUsdcBalance).to.be.equal(previousAmmUsdcBalance)
    })
  })

  context('bridge to goerli', function () {
    const destinationChainId = 5

    it('reverts', async function () {
      await expect(this.connector.bridge(SOURCE, destinationChainId, usdcAddress, 0, '0x')).to.be.reverted
    })
  })
}
