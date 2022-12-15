import { SOURCES as BRIDGE_SOURCES } from '@mimic-fi/v2-bridge-connector'
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

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const WHALE = '0xf584f8728b874a6a5c7a8d4d387c9aae9172d621'

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

    const SLIPPAGE = fp(0.01)
    const LIMIT_TYPE = 0 // slippage

    const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
    const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
    const BALANCER_V2_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'
    const PARASWAP_V5_AUGUSTUS = '0xdef171fe48cf0115b1d80b88dc8eab59176fee57'
    const ONE_INCH_V5_ROUTER = '0x1111111254EEB25477B68fb85Ed929f73A960582'
    const CHAINLINK_USDC_ETH = '0x986b5E1e1755e3C2440e960477f25201B0a8bbD4'

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
      const poolId = '0x96646936b91d6b9d7d0c47c496afbf3d6ec7b6f8000200000000000000000019'
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
      const bridge = '0x3666f603Cc164936C1b87e207F36BEBa4AC5f18a'

      function bridgesToL2Properly(chainId: number) {
        const amountIn = toUSDC(300)
        const deadline = MAX_UINT256
        const relayer = ZERO_ADDRESS
        const relayerFee = 0

        context('when the data is encoded properly', async () => {
          const data = defaultAbiCoder.encode(
            ['address', 'uint256', 'address', 'uint256'],
            [bridge, deadline, relayer, relayerFee]
          )

          it('should send the tokens to the bridge', async () => {
            const previousSenderBalance = await usdc.balanceOf(whale.address)
            const previousBridgeBalance = await usdc.balanceOf(bridge)
            const previousSmartVaultBalance = await usdc.balanceOf(smartVault.address)

            await usdc.connect(whale).transfer(smartVault.address, amountIn)
            await smartVault
              .connect(whale)
              .bridge(source, chainId, USDC, amountIn, LIMIT_TYPE, SLIPPAGE, smartVault.address, data)

            const currentSenderBalance = await usdc.balanceOf(whale.address)
            expect(currentSenderBalance).to.be.equal(previousSenderBalance.sub(amountIn))

            const currentBridgeBalance = await usdc.balanceOf(bridge)
            expect(currentBridgeBalance).to.be.equal(previousBridgeBalance.add(amountIn))

            const currentSmartVaultBalance = await usdc.balanceOf(smartVault.address)
            expect(currentSmartVaultBalance).to.be.equal(previousSmartVaultBalance)
          })
        })

        context('when the data is not encoded properly', async () => {
          const data = '0x'

          it('reverts', async () => {
            await expect(
              smartVault
                .connect(whale)
                .bridge(source, chainId, USDC, amountIn, LIMIT_TYPE, SLIPPAGE, smartVault.address, data)
            ).to.be.revertedWith('HOP_INVALID_L1_L2_DATA_LENGTH')
          })
        })
      }

      context('bridge to optimism', () => {
        const destinationChainId = 10

        bridgesToL2Properly(destinationChainId)
      })

      context('bridge to polygon', () => {
        const destinationChainId = 137

        bridgesToL2Properly(destinationChainId)
      })

      context('bridge to gnosis', () => {
        const destinationChainId = 100

        bridgesToL2Properly(destinationChainId)
      })

      context('bridge to arbitrum', () => {
        const destinationChainId = 42161

        bridgesToL2Properly(destinationChainId)
      })

      context('bridge to mainnet', () => {
        const destinationChainId = 1

        it('reverts', async () => {
          await expect(
            smartVault
              .connect(whale)
              .bridge(source, destinationChainId, USDC, 0, LIMIT_TYPE, SLIPPAGE, smartVault.address, '0x')
          ).to.be.revertedWith('BRIDGE_SAME_CHAIN')
        })
      })
    })
  })
})
