import { getHopBonderFee, SOURCES as BRIDGE_SOURCES } from '@mimic-fi/v2-bridge-connector'
import { assertEvent, deploy, fp, getSigners, impersonate, instanceAt, MAX_UINT256, toUSDC } from '@mimic-fi/v2-helpers'
import { SOURCES as SWAP_SOURCES } from '@mimic-fi/v2-swap-connector'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { defaultAbiCoder } from 'ethers/lib/utils'

/* eslint-disable no-secrets/no-secrets */

const CHAIN = 42161
const USDC = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8'
const WETH = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'
const WHALE = '0x62383739d68dd0f844103db8dfb05a7eded5bbe6'

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
    const implementation = await deploy('SmartVault', [WETH, registry.address])
    await registry.connect(admin).register(await implementation.NAMESPACE(), implementation.address, false)
    const initializeData = implementation.interface.encodeFunctionData('initialize', [admin.address])
    const tx = await registry.clone(implementation.address, initializeData)
    const event = await assertEvent(tx, 'Cloned', { implementation })
    smartVault = await instanceAt('SmartVault', event.args.instance)
  })

  context('swap', () => {
    let swapConnector: Contract

    const SLIPPAGE = fp(0.02)
    const LIMIT_TYPE = 0 // slippage

    const UNISWAP_V2_ROUTER = '0x0000000000000000000000000000000000000000' // No support
    const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
    const BALANCER_V2_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'
    const PARASWAP_V5_AUGUSTUS = '0xdef171fe48cf0115b1d80b88dc8eab59176fee57'
    const ONE_INCH_V5_ROUTER = '0x1111111254EEB25477B68fb85Ed929f73A960582'
    const CHAINLINK_ETH_USD = '0x639fe6ab55c921f74e7fac1ee960c0b6293ba612'

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
      await smartVault.connect(admin).setPriceFeeds([WETH], [USDC], [CHAINLINK_ETH_USD])
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
      const poolId = '0x64541216bafffeec8ea535bb71fbc927831d0595000100000000000000000002'
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
    const SLIPPAGE = fp(0.002)

    before('set bridge connector', async () => {
      bridgeConnector = await deploy(
        '@mimic-fi/v2-bridge-connector/artifacts/contracts/BridgeConnector.sol/BridgeConnector',
        [registry.address]
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
      const hopAmm = '0xe22D2beDb3Eca35E6397e0C6D62857094aA26F52'

      function itBridgesFromL2Properly(destinationChainId: number) {
        let data: string, amm: Contract

        const amountIn = toUSDC(300)
        const deadline = MAX_UINT256

        beforeEach('estimate bonder fee and compute data', async () => {
          amm = await instanceAt(
            '@mimic-fi/v2-bridge-connector/artifacts/contracts/interfaces/IHopL2AMM.sol/IHopL2AMM',
            hopAmm
          )
          const bonderFee = await getHopBonderFee(CHAIN, destinationChainId, usdc, amountIn, LIMIT_TYPE, SLIPPAGE)
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
          await smartVault.connect(whale).bridge(source, destinationChainId, USDC, amountIn, LIMIT_TYPE, SLIPPAGE, data)

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
          await smartVault.connect(whale).bridge(source, destinationChainId, USDC, amountIn, LIMIT_TYPE, SLIPPAGE, data)

          const currentHopUsdcSupply = await hUsdc.totalSupply()
          const burnedAmount = previousHopUsdcSupply.sub(currentHopUsdcSupply)
          const minAmountOut = amountIn.sub(amountIn.mul(SLIPPAGE).div(fp(1)))
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

      context('bridge to polygon', () => {
        const destinationChainId = 137

        itBridgesFromL2Properly(destinationChainId)
      })

      context('bridge to mainnet', () => {
        const destinationChainId = 1

        itBridgesFromL2Properly(destinationChainId)
      })

      context('bridge to arbitrum', () => {
        const destinationChainId = 42161

        it('reverts', async () => {
          await expect(
            smartVault.connect(whale).bridge(source, destinationChainId, USDC, 0, LIMIT_TYPE, SLIPPAGE, '0x')
          ).to.be.revertedWith('BRIDGE_SAME_CHAIN')
        })
      })
    })
  })
})
