import { currentBlockNumber, getForkedNetwork } from '@mimic-fi/v2-helpers'
import { BigNumber, Contract } from 'ethers'
import fs from 'fs'
import hre from 'hardhat'
import { HardhatNetworkConfig } from 'hardhat/types'
import path from 'path'

import { getSwapData } from '../../../src/paraswap'

export async function getParaSwapData(
  sender: Contract,
  tokenIn: Contract,
  tokenOut: Contract,
  amountIn: BigNumber,
  slippage: number
): Promise<string> {
  const network = getForkedNetwork(hre)
  const config = hre.network.config as HardhatNetworkConfig
  const blockNumber = config?.forking?.blockNumber?.toString() || (await currentBlockNumber()).toString()
  const fixture = await readFixture(tokenIn, tokenOut, network, blockNumber)
  if (fixture) return fixture

  const data = await getSwapData(sender, tokenIn, tokenOut, amountIn, slippage)
  await saveFixture(tokenIn, tokenOut, network, blockNumber, data)
  return data
}

async function readFixture(tokenIn: Contract, tokenOut: Contract, network: string, blockNumber: string) {
  const swapPath = `${await tokenIn.symbol()}-${await tokenOut.symbol()}`
  const fixturePath = path.join(__dirname, 'fixtures', network, blockNumber, swapPath)
  if (fs.existsSync(fixturePath)) return fs.readFileSync(fixturePath, 'utf8')
}

async function saveFixture(tokenIn: Contract, tokenOut: Contract, network: string, blockNumber: string, data: string) {
  const fixturesPath = path.join(__dirname, 'fixtures')
  if (!fs.existsSync(fixturesPath)) fs.mkdirSync(fixturesPath)

  const networkPath = path.join(fixturesPath, network)
  if (!fs.existsSync(networkPath)) fs.mkdirSync(fixturesPath)

  const blockNumberPath = path.join(networkPath, blockNumber)
  if (!fs.existsSync(blockNumberPath)) fs.mkdirSync(blockNumberPath)

  const swapPath = path.join(blockNumberPath, `${await tokenIn.symbol()}-${await tokenOut.symbol()}`)
  fs.writeFileSync(swapPath, data)
}
