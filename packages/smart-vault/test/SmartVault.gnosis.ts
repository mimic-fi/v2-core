import { getHopBonderFee, SOURCES as BRIDGE_SOURCES } from '@mimic-fi/v2-bridge-connector'
import {
  assertEvent,
  deploy,
  fp,
  getSigners,
  impersonate,
  instanceAt,
  MAX_UINT256,
  ONES_BYTES32,
  toUSDC,
} from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { defaultAbiCoder } from 'ethers/lib/utils'

/* eslint-disable no-secrets/no-secrets */

const CHAIN = 100
const USDC = '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83'
const WXDAI = '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d'
const WHALE = '0xb4c575308221caa398e0dd2cdeb6b2f10d7b000a'

describe('SmartVault', () => {
  let smartVault: Contract, registry: Contract
  let usdc: Contract
  let admin: SignerWithAddress, whale: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin] = await getSigners()
    whale = await impersonate(WHALE, fp(100))
  })

  before('load tokens', async () => {
    usdc = await instanceAt('IERC20Metadata', USDC)
  })

  before('deploy smart vault', async () => {
    registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [admin.address])
    const implementation = await deploy('SmartVault', [WXDAI, registry.address])
    await registry.connect(admin).register(await implementation.NAMESPACE(), implementation.address, false)
    const initializeData = implementation.interface.encodeFunctionData('initialize', [admin.address])
    const factory = await deploy('SmartVaultsFactory', [registry.address])
    const tx = await factory.create(ONES_BYTES32, implementation.address, initializeData)
    const event = await assertEvent(tx, 'Created', { implementation })
    smartVault = await instanceAt('SmartVault', event.args.instance)
  })

  context('bridge', () => {
    let bridgeConnector: Contract

    const LIMIT_TYPE = 0 // slippage
    const SLIPPAGE = 0.002

    before('set bridge connector', async () => {
      bridgeConnector = await deploy(
        '@mimic-fi/v2-bridge-connector/artifacts/contracts/BridgeConnector.sol/BridgeConnector',
        [WXDAI, registry.address]
      )
      await registry.connect(admin).register(await bridgeConnector.NAMESPACE(), bridgeConnector.address, true)

      const setBridgeConnectorRole = smartVault.interface.getSighash('setBridgeConnector')
      await smartVault.connect(admin).authorize(admin.address, setBridgeConnectorRole)
      await smartVault.connect(admin).setBridgeConnector(bridgeConnector.address)
    })

    before('allow whale to bridge', async () => {
      const bridgeRole = smartVault.interface.getSighash('bridge')
      await smartVault.connect(admin).authorize(whale.address, bridgeRole)
    })

    context('Hop', () => {
      const source = BRIDGE_SOURCES.HOP
      const hopAmm = '0x76b22b8C1079A44F1211D867D68b1eda76a635A7'

      function itBridgesFromL2Properly(destinationChainId: number) {
        let data: string, amm: Contract

        const amountIn = toUSDC(300)
        const deadline = MAX_UINT256

        beforeEach('estimate bonder fee and compute data', async () => {
          amm = await instanceAt(
            '@mimic-fi/v2-bridge-connector/artifacts/contracts/interfaces/IHopL2AMM.sol/IHopL2AMM',
            hopAmm
          )
          const bonderFee = await getHopBonderFee(CHAIN, destinationChainId, usdc, amountIn, SLIPPAGE)
          data =
            destinationChainId == 1
              ? defaultAbiCoder.encode(['address', 'uint256'], [hopAmm, bonderFee])
              : defaultAbiCoder.encode(['address', 'uint256', 'uint256'], [hopAmm, bonderFee, deadline])
        })

        it('should send the canonical tokens to the exchange', async () => {
          const ammExchangeAddress = await amm.exchangeAddress()
          const previousSenderBalance = await usdc.balanceOf(whale.address)
          const previousExchangeBalance = await usdc.balanceOf(ammExchangeAddress)
          const previousConnectorBalance = await usdc.balanceOf(bridgeConnector.address)

          await usdc.connect(whale).transfer(smartVault.address, amountIn)
          await smartVault
            .connect(whale)
            .bridge(source, destinationChainId, USDC, amountIn, LIMIT_TYPE, fp(SLIPPAGE), smartVault.address, data)

          const currentSenderBalance = await usdc.balanceOf(whale.address)
          expect(currentSenderBalance).to.be.equal(previousSenderBalance.sub(amountIn))

          const currentExchangeBalance = await usdc.balanceOf(ammExchangeAddress)
          expect(currentExchangeBalance).to.be.equal(previousExchangeBalance.add(amountIn))

          const currentConnectorBalance = await usdc.balanceOf(bridgeConnector.address)
          expect(currentConnectorBalance).to.be.equal(previousConnectorBalance)
        })

        it('should burn at least the requested hop tokens', async () => {
          const hUsdc = await instanceAt('IERC20', await amm.hToken())
          const previousHopUsdcSupply = await hUsdc.totalSupply()

          await usdc.connect(whale).transfer(smartVault.address, amountIn)
          await smartVault
            .connect(whale)
            .bridge(source, destinationChainId, USDC, amountIn, LIMIT_TYPE, fp(SLIPPAGE), smartVault.address, data)

          const currentHopUsdcSupply = await hUsdc.totalSupply()
          const burnedAmount = previousHopUsdcSupply.sub(currentHopUsdcSupply)
          const minAmountOut = amountIn.sub(amountIn.mul(fp(SLIPPAGE)).div(fp(1)))
          expect(burnedAmount).to.be.at.least(minAmountOut)
        })
      }

      context('bridge to optimism', () => {
        const destinationChainId = 10

        itBridgesFromL2Properly(destinationChainId)
      })

      context('bridge to polygon', () => {
        const destinationChainId = 137

        itBridgesFromL2Properly(destinationChainId)
      })

      context('bridge to arbitrum', () => {
        const destinationChainId = 42161

        itBridgesFromL2Properly(destinationChainId)
      })

      context('bridge to mainnet', () => {
        const destinationChainId = 1

        itBridgesFromL2Properly(destinationChainId)
      })

      context('bridge to gnosis', () => {
        const destinationChainId = 100

        it('reverts', async () => {
          await expect(
            smartVault
              .connect(whale)
              .bridge(source, destinationChainId, USDC, 0, LIMIT_TYPE, fp(SLIPPAGE), smartVault.address, '0x')
          ).to.be.revertedWith('BRIDGE_SAME_CHAIN')
        })
      })
    })
  })
})
