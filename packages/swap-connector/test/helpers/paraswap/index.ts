import { bn, currentBlockNumber, getForkedNetwork } from '@mimic-fi/v2-helpers'
import { BigNumber, Contract } from 'ethers'
import fs from 'fs'
import hre from 'hardhat'
import { HardhatNetworkConfig } from 'hardhat/types'
import path from 'path'

import { getSwapData, SwapData } from '../../../src/paraswap'

export async function getParaSwapData(
  sender: Contract,
  tokenIn: Contract,
  tokenOut: Contract,
  amountIn: BigNumber,
  slippage: number
): Promise<SwapData> {
  const network = getForkedNetwork(hre)
  const config = hre.network.config as HardhatNetworkConfig
  const blockNumber = config?.forking?.blockNumber?.toString() || (await currentBlockNumber()).toString()

  let swapData = await readSwapData(tokenIn, tokenOut, network, blockNumber)
  if (swapData) return swapData

  swapData = await getSwapData(sender, tokenIn, tokenOut, amountIn, slippage)
  await saveSwapData(tokenIn, tokenOut, amountIn, swapData, network, blockNumber)
  return swapData
}

async function readSwapData(
  tokenIn: Contract,
  tokenOut: Contract,
  network: string,
  blockNumber: string
): Promise<SwapData | undefined> {
  const swapPath = `${await tokenIn.symbol()}-${await tokenOut.symbol()}.json`
  const fixturePath = path.join(__dirname, 'fixtures', network, blockNumber, swapPath)
  if (!fs.existsSync(fixturePath)) return undefined

  const fixture = JSON.parse(fs.readFileSync(fixturePath).toString())
  return {
    minAmountOut: bn(fixture.minAmountOut),
    data: fixture.data,
    sig: fixture.sig,
    signer: fixture.signer,
  }
}

async function saveSwapData(
  tokenIn: Contract,
  tokenOut: Contract,
  amountIn: BigNumber,
  swapData: SwapData,
  network: string,
  blockNumber: string
): Promise<void> {
  const output = {
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    amountIn: amountIn.toString(),
    minAmountOut: swapData.minAmountOut.toString(),
    data: swapData.data,
    sig: swapData.sig,
    signer: swapData.signer,
  }

  const fixturesPath = path.join(__dirname, 'fixtures')
  if (!fs.existsSync(fixturesPath)) fs.mkdirSync(fixturesPath)

  const networkPath = path.join(fixturesPath, network)
  if (!fs.existsSync(networkPath)) fs.mkdirSync(networkPath)

  const blockNumberPath = path.join(networkPath, blockNumber)
  if (!fs.existsSync(blockNumberPath)) fs.mkdirSync(blockNumberPath)

  const swapPath = path.join(blockNumberPath, `${await tokenIn.symbol()}-${await tokenOut.symbol()}.json`)
  fs.writeFileSync(swapPath, JSON.stringify(output, null, 2))
}
