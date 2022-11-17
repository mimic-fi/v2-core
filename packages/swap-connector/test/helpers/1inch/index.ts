import { currentBlockNumber, getForkedNetwork } from '@mimic-fi/v2-helpers'
import { BigNumber, Contract } from 'ethers'
import fs from 'fs'
import hre from 'hardhat'
import { HardhatNetworkConfig } from 'hardhat/types'
import path from 'path'

import { get1inchSwapData } from '../../../src/1inch'

type Fixture = {
  tokenIn: string
  tokenOut: string
  amountIn: string
  slippage: number
  data: string
}

export async function loadOrGet1inchSwapData(
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
  if (fixture) return fixture.data

  const data = await get1inchSwapData(sender, tokenIn, tokenOut, amountIn, slippage)
  await saveFixture(tokenIn, tokenOut, amountIn, slippage, data, network, blockNumber)
  return data
}

async function readFixture(
  tokenIn: Contract,
  tokenOut: Contract,
  network: string,
  blockNumber: string
): Promise<Fixture | undefined> {
  const swapPath = `${await tokenIn.symbol()}-${await tokenOut.symbol()}.json`
  const fixturePath = path.join(__dirname, 'fixtures', network, blockNumber, swapPath)
  if (!fs.existsSync(fixturePath)) return undefined
  return JSON.parse(fs.readFileSync(fixturePath).toString())
}

async function saveFixture(
  tokenIn: Contract,
  tokenOut: Contract,
  amountIn: BigNumber,
  slippage: number,
  data: string,
  network: string,
  blockNumber: string
): Promise<void> {
  const output = {
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    amountIn: amountIn.toString(),
    slippage,
    data,
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
