import { BigNumber } from 'ethers'

import { BigNumberish, bn } from './numbers'

export const SECOND = 1
export const MINUTE = SECOND * 60
export const HOUR = MINUTE * 60
export const DAY = HOUR * 24
export const WEEK = DAY * 7
export const MONTH = DAY * 30

export const currentTimestamp = async (): Promise<BigNumber> => {
  const { network } = await import('hardhat')
  const { timestamp } = await network.provider.send('eth_getBlockByNumber', ['latest', true])
  return bn(timestamp)
}

export const advanceTime = async (seconds: BigNumberish): Promise<void> => {
  const { ethers } = await import('hardhat')
  await ethers.provider.send('evm_increaseTime', [parseInt(seconds.toString())])
  await ethers.provider.send('evm_mine', [])
}

export const setNextBlockTimestamp = async (timestamp: BigNumberish): Promise<void> => {
  const { ethers } = await import('hardhat')
  await ethers.provider.send('evm_setNextBlockTimestamp', [parseInt(timestamp.toString())])
}
