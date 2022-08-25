import { defaultAbiCoder } from '@ethersproject/abi'
import { deploy, fp, getSigners, impersonate, instanceAt, pct } from '@mimic-fi/v2-helpers'
import { createClone } from '@mimic-fi/v2-registry'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'

/* eslint-disable no-secrets/no-secrets */

const DEX = {
  UNISWAP_V2: 0,
  UNISWAP_V3: 1,
  BALANCER_V2: 2,
}

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const WBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
const WHALE = '0xf584f8728b874a6a5c7a8d4d387c9aae9172d621'

const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
const BALANCER_V2_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'

const UNISWAP_V3_FEE = 3000
const CHAINLINK_ORACLE_USDC_ETH = '0x986b5E1e1755e3C2440e960477f25201B0a8bbD4'
const CHAINLINK_ORACLE_WBTC_ETH = '0xdeb288F737066589598e9214E782fa5A8eD689e8'
const BALANCER_POOL_WETH_USDC_ID = '0x96646936b91d6b9d7d0c47c496afbf3d6ec7b6f8000200000000000000000019'
const BALANCER_POOL_WETH_WBTC_ID = '0xa6f548df93de924d73be7d25dc02554c6bd66db500020000000000000000000e'

describe('SwapConnector', () => {
  let connector: Contract, oracle: Contract
  let weth: Contract, wbtc: Contract, usdc: Contract
  let admin: SignerWithAddress, whale: SignerWithAddress

  const SLIPPAGE = 0.025

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin] = await getSigners()
  })

  before('create swap connector', async () => {
    connector = await deploy('SwapConnector', [UNISWAP_V3_ROUTER, UNISWAP_V2_ROUTER, BALANCER_V2_VAULT])
  })

  before('create price oracle', async () => {
    const registry = await deploy('@mimic-fi/v2-registry/artifacts/contracts/registry/Registry.sol/Registry', [
      admin.address,
    ])
    oracle = await createClone(
      registry,
      admin,
      '@mimic-fi/v2-price-oracle/artifacts/contracts/PriceOracle.sol/PriceOracle',
      [WETH, registry.address],
      [admin.address]
    )

    await registry.connect(admin).register(await oracle.FEEDS_NAMESPACE(), CHAINLINK_ORACLE_USDC_ETH)
    await registry.connect(admin).register(await oracle.FEEDS_NAMESPACE(), CHAINLINK_ORACLE_WBTC_ETH)
    await oracle
      .connect(admin)
      .setFeeds([USDC, WBTC], [WETH, WETH], [CHAINLINK_ORACLE_USDC_ETH, CHAINLINK_ORACLE_WBTC_ETH])
  })

  before('load tokens and accounts', async () => {
    weth = await instanceAt('IERC20', WETH)
    wbtc = await instanceAt('IERC20', WBTC)
    usdc = await instanceAt('IERC20', USDC)
    whale = await impersonate(WHALE, fp(100))
  })

  const getExpectedMinAmountOut = async (tokenIn: string, tokenOut: string, amountIn: BigNumber) => {
    const price = await oracle.getPrice(tokenIn, tokenOut)
    const expectedAmountOut = price.mul(amountIn).div(fp(1))
    return expectedAmountOut.sub(pct(expectedAmountOut, SLIPPAGE))
  }

  const itSingleSwapsCorrectly = (data: string) => {
    it('swaps correctly USDC-WETH', async () => {
      const amountIn = fp(10e3).div(1e12) // USDC 6 decimals
      const previousBalance = await weth.balanceOf(WHALE)
      await usdc.connect(whale).transfer(connector.address, amountIn)

      await connector.connect(whale).swap(USDC, WETH, amountIn, 0, data)

      const currentBalance = await weth.balanceOf(WHALE)
      const expectedMinAmountOut = await getExpectedMinAmountOut(USDC, WETH, amountIn)
      expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
    })

    it('swaps correctly WETH-USDC', async () => {
      const amountIn = fp(50)
      const previousBalance = await usdc.balanceOf(WHALE)
      await weth.connect(whale).transfer(connector.address, amountIn)

      await connector.connect(whale).swap(WETH, USDC, amountIn, 0, data)

      const currentBalance = await usdc.balanceOf(WHALE)
      const expectedMinAmountOut = await getExpectedMinAmountOut(WETH, USDC, amountIn)
      expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
    })
  }

  const itBatchSwapsCorrectly = (usdcWbtcData: string, wbtcUsdcData: string) => {
    it('swaps correctly USDC-WBTC', async () => {
      const amountIn = fp(10e3).div(1e12) // USDC 6 decimals
      const previousBalance = await wbtc.balanceOf(WHALE)
      await usdc.connect(whale).transfer(connector.address, amountIn)

      await connector.connect(whale).swap(USDC, WBTC, amountIn, 0, usdcWbtcData)

      const currentBalance = await wbtc.balanceOf(WHALE)
      const expectedMinAmountOut = await getExpectedMinAmountOut(USDC, WBTC, amountIn)
      expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
    })

    it('swaps correctly WTBC-USDC', async () => {
      const amountIn = fp(1).div(1e10) // WBTC 8 decimals
      const previousBalance = await usdc.balanceOf(WHALE)
      await wbtc.connect(whale).transfer(connector.address, amountIn)

      await connector.connect(whale).swap(WBTC, USDC, amountIn, 0, wbtcUsdcData)

      const currentBalance = await usdc.balanceOf(WHALE)
      const expectedMinAmountOut = await getExpectedMinAmountOut(WBTC, USDC, amountIn)
      expect(currentBalance.sub(previousBalance)).to.be.at.least(expectedMinAmountOut)
    })
  }

  context('Uniswap V2', () => {
    const dex = DEX.UNISWAP_V2

    context('single swap', () => {
      const data = defaultAbiCoder.encode(['uint8'], [dex])

      itSingleSwapsCorrectly(data)
    })

    context('batch swap', () => {
      const data = defaultAbiCoder.encode(['uint8', 'address[]'], [dex, [WETH]])

      itBatchSwapsCorrectly(data, data)
    })
  })

  context('Uniswap V3', () => {
    const dex = DEX.UNISWAP_V3

    context('single swap', () => {
      const data = defaultAbiCoder.encode(['uint8', 'uint24'], [dex, UNISWAP_V3_FEE])

      itSingleSwapsCorrectly(data)
    })

    context('batch swap', () => {
      const data = defaultAbiCoder.encode(
        ['uint8', 'address[]', 'uint24[]'],
        [dex, [WETH], [UNISWAP_V3_FEE, UNISWAP_V3_FEE]]
      )

      itBatchSwapsCorrectly(data, data)
    })
  })

  context('Balancer V2', () => {
    const dex = DEX.BALANCER_V2

    context('single swap', () => {
      const data = defaultAbiCoder.encode(['uint8', 'bytes32'], [dex, BALANCER_POOL_WETH_USDC_ID])

      itSingleSwapsCorrectly(data)
    })

    context('batch swap', () => {
      const usdcWbtcData = defaultAbiCoder.encode(
        ['uint8', 'address[]', 'bytes32[]'],
        [dex, [WETH], [BALANCER_POOL_WETH_USDC_ID, BALANCER_POOL_WETH_WBTC_ID]]
      )

      const wbtcUsdcData = defaultAbiCoder.encode(
        ['uint8', 'address[]', 'bytes32[]'],
        [dex, [WETH], [BALANCER_POOL_WETH_WBTC_ID, BALANCER_POOL_WETH_USDC_ID]]
      )

      itBatchSwapsCorrectly(usdcWbtcData, wbtcUsdcData)
    })
  })
})
