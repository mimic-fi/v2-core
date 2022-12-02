import { assertEvent, deploy, fp, getSigners, impersonate, instanceAt, toUSDC, toWBTC } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { defaultAbiCoder } from 'ethers/lib/utils'

const SOURCE = {
  UNISWAP_V2: 0,
  UNISWAP_V3: 1,
  BALANCER_V2: 2,
  PARASWAP_V5: 3,
  ONE_INCH_V5: 4,
}

/* eslint-disable no-secrets/no-secrets */

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const WBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
const WHALE = '0xf584f8728b874a6a5c7a8d4d387c9aae9172d621'

const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
const BALANCER_V2_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'
const PARASWAP_V5_AUGUSTUS = '0xdef171fe48cf0115b1d80b88dc8eab59176fee57'
const ONE_INCH_V5_ROUTER = '0x1111111254EEB25477B68fb85Ed929f73A960582'

const CHAINLINK_ORACLE_USDC_ETH = '0x986b5E1e1755e3C2440e960477f25201B0a8bbD4'
const CHAINLINK_ORACLE_WBTC_ETH = '0xdeb288F737066589598e9214E782fa5A8eD689e8'

describe('SmartVault', () => {
  let smartVault: Contract, registry: Contract
  let priceOracle: Contract, swapConnector: Contract
  let weth: Contract, wbtc: Contract, usdc: Contract
  let admin: SignerWithAddress, whale: SignerWithAddress

  const SLIPPAGE = fp(0.03)

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin] = await getSigners()
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

  before('set smart vault price oracle', async () => {
    const args = [WETH, registry.address]
    priceOracle = await deploy('@mimic-fi/v2-price-oracle/artifacts/contracts/oracle/PriceOracle.sol/PriceOracle', args)
    await registry.connect(admin).register(await priceOracle.NAMESPACE(), priceOracle.address, true)
    const setPriceOracleRole = smartVault.interface.getSighash('setPriceOracle')
    await smartVault.connect(admin).authorize(admin.address, setPriceOracleRole)
    await smartVault.connect(admin).setPriceOracle(priceOracle.address)

    const setPriceFeedRole = smartVault.interface.getSighash('setPriceFeeds')
    await smartVault.connect(admin).authorize(admin.address, setPriceFeedRole)
    await smartVault
      .connect(admin)
      .setPriceFeeds([USDC, WBTC], [WETH, WETH], [CHAINLINK_ORACLE_USDC_ETH, CHAINLINK_ORACLE_WBTC_ETH])
  })

  before('set smart vault swap connector', async () => {
    const arg = [
      UNISWAP_V2_ROUTER,
      UNISWAP_V3_ROUTER,
      BALANCER_V2_VAULT,
      PARASWAP_V5_AUGUSTUS,
      ONE_INCH_V5_ROUTER,
      registry.address,
    ]
    swapConnector = await deploy('@mimic-fi/v2-swap-connector/artifacts/contracts/SwapConnector.sol/SwapConnector', arg)
    await registry.connect(admin).register(await swapConnector.NAMESPACE(), swapConnector.address, true)

    const setSwapConnectorRole = smartVault.interface.getSighash('setSwapConnector')
    await smartVault.connect(admin).authorize(admin.address, setSwapConnectorRole)
    await smartVault.connect(admin).setSwapConnector(swapConnector.address)
  })

  before('load tokens', async () => {
    weth = await instanceAt('IERC20Metadata', WETH)
    wbtc = await instanceAt('IERC20Metadata', WBTC)
    usdc = await instanceAt('IERC20Metadata', USDC)
  })

  before('allow whale to swap', async () => {
    whale = await impersonate(WHALE, fp(100))
    const swapRole = smartVault.interface.getSighash('swap')
    await smartVault.connect(admin).authorize(whale.address, swapRole)
  })

  const getExpectedMinAmountOut = async (tokenIn: string, tokenOut: string, amountIn: BigNumber) => {
    const price = await smartVault.getPrice(tokenIn, tokenOut)
    const expectedAmountOut = price.mul(amountIn).div(fp(1))
    return expectedAmountOut.sub(expectedAmountOut.mul(SLIPPAGE).div(fp(1)))
  }

  const itSingleSwapsCorrectly = (source: number, usdcWethData: string, wethUsdcData: string) => {
    it('swaps correctly USDC-WETH', async () => {
      const amountIn = toUSDC(10e3)
      const previousBalance = await weth.balanceOf(smartVault.address)
      await usdc.connect(whale).transfer(smartVault.address, amountIn)

      await smartVault.connect(whale).swap(source, USDC, WETH, amountIn, 0, SLIPPAGE, usdcWethData)

      const currentBalance = await weth.balanceOf(smartVault.address)
      const expectedMinAmountOut = await getExpectedMinAmountOut(USDC, WETH, amountIn)
      expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
    })

    it('swaps correctly WETH-USDC', async () => {
      const amountIn = fp(3)
      const previousBalance = await usdc.balanceOf(smartVault.address)
      await weth.connect(whale).transfer(smartVault.address, amountIn)

      await smartVault.connect(whale).swap(source, WETH, USDC, amountIn, 0, SLIPPAGE, wethUsdcData)

      const currentBalance = await usdc.balanceOf(smartVault.address)
      const expectedMinAmountOut = await getExpectedMinAmountOut(WETH, USDC, amountIn)
      expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
    })
  }

  const itBatchSwapsCorrectly = (source: number, usdcWbtcData: string, wbtcUsdcData: string) => {
    it('swaps correctly USDC-WBTC', async () => {
      const amountIn = toUSDC(10e3)
      const previousBalance = await wbtc.balanceOf(smartVault.address)
      await usdc.connect(whale).transfer(smartVault.address, amountIn)

      await smartVault.connect(whale).swap(source, USDC, WBTC, amountIn, 0, SLIPPAGE, usdcWbtcData)

      const currentBalance = await wbtc.balanceOf(smartVault.address)
      const expectedMinAmountOut = await getExpectedMinAmountOut(USDC, WBTC, amountIn)
      expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
    })

    it('swaps correctly WTBC-USDC', async () => {
      const amountIn = toWBTC(1)
      const previousBalance = await usdc.balanceOf(smartVault.address)
      await wbtc.connect(whale).transfer(smartVault.address, amountIn)

      await smartVault.connect(whale).swap(source, WBTC, USDC, amountIn, 0, SLIPPAGE, wbtcUsdcData)

      const currentBalance = await usdc.balanceOf(smartVault.address)
      const expectedMinAmountOut = await getExpectedMinAmountOut(WBTC, USDC, amountIn)
      expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
    })
  }

  context('Uniswap V2', () => {
    const source = SOURCE.UNISWAP_V2

    context('single swap', () => {
      const data = '0x'

      itSingleSwapsCorrectly(source, data, data)
    })

    context('batch swap', () => {
      const data = defaultAbiCoder.encode(['address[]'], [[WETH]])

      itBatchSwapsCorrectly(source, data, data)
    })
  })

  context('Uniswap V3', () => {
    const source = SOURCE.UNISWAP_V3
    const UNISWAP_V3_FEE = 3000

    context('single swap', () => {
      const data = defaultAbiCoder.encode(['uint24'], [UNISWAP_V3_FEE])

      itSingleSwapsCorrectly(source, data, data)
    })

    context('batch swap', () => {
      const data = defaultAbiCoder.encode(['address[]', 'uint24[]'], [[WETH], [UNISWAP_V3_FEE, UNISWAP_V3_FEE]])

      itBatchSwapsCorrectly(source, data, data)
    })
  })

  context('Balancer V2', () => {
    const source = SOURCE.BALANCER_V2
    const BALANCER_POOL_WETH_USDC_ID = '0x96646936b91d6b9d7d0c47c496afbf3d6ec7b6f8000200000000000000000019'
    const BALANCER_POOL_WETH_WBTC_ID = '0xa6f548df93de924d73be7d25dc02554c6bd66db500020000000000000000000e'

    context('single swap', () => {
      const data = defaultAbiCoder.encode(['bytes32'], [BALANCER_POOL_WETH_USDC_ID])

      itSingleSwapsCorrectly(source, data, data)
    })

    context('batch swap', () => {
      const usdcWbtcData = defaultAbiCoder.encode(
        ['address[]', 'bytes32[]'],
        [[WETH], [BALANCER_POOL_WETH_USDC_ID, BALANCER_POOL_WETH_WBTC_ID]]
      )

      const wbtcUsdcData = defaultAbiCoder.encode(
        ['address[]', 'bytes32[]'],
        [[WETH], [BALANCER_POOL_WETH_WBTC_ID, BALANCER_POOL_WETH_USDC_ID]]
      )

      itBatchSwapsCorrectly(source, usdcWbtcData, wbtcUsdcData)
    })
  })
})
