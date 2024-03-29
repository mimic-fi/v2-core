import { getHopBonderFee, SOURCES as BRIDGE_SOURCES } from '@mimic-fi/v2-bridge-connector'
import {
  assertEvent,
  deploy,
  fp,
  getSigners,
  impersonate,
  instanceAt,
  MAX_UINT256,
  toUSDC,
  ZERO_ADDRESS,
} from '@mimic-fi/v2-helpers'
import { SOURCES as SWAP_SOURCES } from '@mimic-fi/v2-swap-connector'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { defaultAbiCoder } from 'ethers/lib/utils'

/* eslint-disable no-secrets/no-secrets */

const CHAIN = 137
const USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const WETH = '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'
const WMATIC = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
const WHALE = '0xa8f49d90b24d6a007e5f47bf86d122a9f3211734'

describe('SmartVault', () => {
  let smartVault: Contract, registry: Contract
  let weth: Contract, usdc: Contract
  let admin: SignerWithAddress, whale: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin] = await getSigners()
    whale = await impersonate(WHALE, fp(100))
  })

  before('load tokens', async () => {
    weth = await instanceAt('IERC20Metadata', WETH)
    usdc = await instanceAt('IERC20Metadata', USDC)
  })

  before('deploy smart vault', async () => {
    registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [admin.address])
    const implementation = await deploy('SmartVault', [WMATIC, registry.address])
    await registry.connect(admin).register(await implementation.NAMESPACE(), implementation.address, false)
    const initializeData = implementation.interface.encodeFunctionData('initialize', [admin.address])
    const factory = await deploy('ClonesFactory')
    const tx = await factory.create(implementation.address, initializeData)
    const event = await assertEvent(tx, 'Created')
    smartVault = await instanceAt('SmartVault', event.args.instance)
  })

  context('swap', () => {
    let swapConnector: Contract

    const SLIPPAGE = fp(0.02)
    const LIMIT_TYPE = 0 // slippage

    const UNISWAP_V2_ROUTER = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff' // QuickSwap
    const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
    const BALANCER_V2_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'
    const PARASWAP_V5_AUGUSTUS = '0xdef171fe48cf0115b1d80b88dc8eab59176fee57'
    const ONE_INCH_V5_ROUTER = '0x1111111254EEB25477B68fb85Ed929f73A960582'
    const CHAINLINK_USDC_ETH = '0xefb7e6be8356ccc6827799b6a7348ee674a80eae'

    before('set price oracle', async () => {
      const priceOracle = await deploy(
        '@mimic-fi/v2-price-oracle/artifacts/contracts/oracle/PriceOracle.sol/PriceOracle',
        [WETH, registry.address]
      )
      await registry.connect(admin).register(await priceOracle.NAMESPACE(), priceOracle.address, true)

      const setPriceOracleRole = smartVault.interface.getSighash('setPriceOracle')
      await smartVault.connect(admin).authorize(admin.address, setPriceOracleRole)
      await smartVault.connect(admin).setPriceOracle(priceOracle.address)

      const setPriceFeedRole = smartVault.interface.getSighash('setPriceFeeds')
      await smartVault.connect(admin).authorize(admin.address, setPriceFeedRole)
      await smartVault.connect(admin).setPriceFeeds([USDC], [WETH], [CHAINLINK_USDC_ETH])
    })

    before('set swap connector', async () => {
      swapConnector = await deploy('@mimic-fi/v2-swap-connector/artifacts/contracts/SwapConnector.sol/SwapConnector', [
        UNISWAP_V2_ROUTER,
        UNISWAP_V3_ROUTER,
        BALANCER_V2_VAULT,
        PARASWAP_V5_AUGUSTUS,
        ONE_INCH_V5_ROUTER,
        registry.address,
      ])
      await registry.connect(admin).register(await swapConnector.NAMESPACE(), swapConnector.address, true)

      const setSwapConnectorRole = smartVault.interface.getSighash('setSwapConnector')
      await smartVault.connect(admin).authorize(admin.address, setSwapConnectorRole)
      await smartVault.connect(admin).setSwapConnector(swapConnector.address)
    })

    before('allow whale to swap', async () => {
      const swapRole = smartVault.interface.getSighash('swap')
      await smartVault.connect(admin).authorize(whale.address, swapRole)
    })

    const getExpectedMinAmountOut = async (tokenIn: string, tokenOut: string, amountIn: BigNumber) => {
      const price = await smartVault.getPrice(tokenIn, tokenOut)
      const expectedAmountOut = price.mul(amountIn).div(fp(1))
      return expectedAmountOut.sub(expectedAmountOut.mul(SLIPPAGE).div(fp(1)))
    }

    context('Uniswap V2', () => {
      const source = SWAP_SOURCES.UNISWAP_V2
      const data = '0x'

      it('swaps correctly USDC-WETH', async () => {
        const amountIn = toUSDC(10e3)
        const previousBalance = await weth.balanceOf(smartVault.address)
        await usdc.connect(whale).transfer(smartVault.address, amountIn)

        await smartVault.connect(whale).swap(source, USDC, WETH, amountIn, LIMIT_TYPE, SLIPPAGE, data)

        const currentBalance = await weth.balanceOf(smartVault.address)
        const expectedMinAmountOut = await getExpectedMinAmountOut(USDC, WETH, amountIn)
        expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
      })
    })

    context('Uniswap V3', () => {
      const source = SWAP_SOURCES.UNISWAP_V3
      const fee = 3000
      const data = defaultAbiCoder.encode(['uint24'], [fee])

      it('swaps correctly USDC-WETH', async () => {
        const amountIn = toUSDC(10e3)
        const previousBalance = await weth.balanceOf(smartVault.address)
        await usdc.connect(whale).transfer(smartVault.address, amountIn)

        await smartVault.connect(whale).swap(source, USDC, WETH, amountIn, LIMIT_TYPE, SLIPPAGE, data)

        const currentBalance = await weth.balanceOf(smartVault.address)
        const expectedMinAmountOut = await getExpectedMinAmountOut(USDC, WETH, amountIn)
        expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
      })
    })

    context('Balancer V2', () => {
      const source = SWAP_SOURCES.BALANCER_V2
      const poolId = '0x0297e37f1873d2dab4487aa67cd56b58e2f27875000100000000000000000002'
      const data = defaultAbiCoder.encode(['bytes32'], [poolId])

      it('swaps correctly USDC-WETH', async () => {
        const amountIn = toUSDC(10e3)
        const previousBalance = await weth.balanceOf(smartVault.address)
        await usdc.connect(whale).transfer(smartVault.address, amountIn)

        await smartVault.connect(whale).swap(source, USDC, WETH, amountIn, LIMIT_TYPE, SLIPPAGE, data)

        const currentBalance = await weth.balanceOf(smartVault.address)
        const expectedMinAmountOut = await getExpectedMinAmountOut(USDC, WETH, amountIn)
        expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
      })
    })
  })

  context('bridge', () => {
    let bridgeConnector: Contract

    const LIMIT_TYPE = 0 // slippage
    const SLIPPAGE = 0.002

    const WORMHOLE_CIRCLE_RELAYER = ZERO_ADDRESS
    const CONNEXT = '0x11984dc4465481512eb5b777E44061C158CF2259'
    const AXELAR_GATEWAY = '0x6f015F16De9fC8791b234eF68D486d2bF203FBA8'

    before('set bridge connector', async () => {
      bridgeConnector = await deploy(
        '@mimic-fi/v2-bridge-connector/artifacts/contracts/BridgeConnector.sol/BridgeConnector',
        [WMATIC, AXELAR_GATEWAY, CONNEXT, WORMHOLE_CIRCLE_RELAYER, registry.address]
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

      context('bridge to gnosis', () => {
        const destinationChainId = 100

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

      context('bridge to polygon', () => {
        const destinationChainId = 137

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
