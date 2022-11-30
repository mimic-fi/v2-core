import { bn } from '@mimic-fi/v2-helpers'
import axios, { AxiosError } from 'axios'
import { BigNumber, Contract } from 'ethers'

const HOP_URL = 'https://api.hop.exchange/v1'

export type QuoteResponse = { data: { bonderFee: string; error: string } }

const CHAINS: { [key: number]: string } = {
  1: 'mainnet',
  137: 'polygon',
  100: 'gnosis',
  10: 'optimism',
  42161: 'arbitrum',
}

export async function getHopBonderFee(
  fromChainId: number,
  toChainId: number,
  token: Contract,
  amount: BigNumber,
  slippage: number
): Promise<BigNumber> {
  try {
    const { data } = await getQuote(fromChainId, toChainId, token, amount, slippage)
    if (data.error) throw Error(data.error)
    return bn(data.bonderFee)
  } catch (error) {
    if (error instanceof AxiosError) throw Error(error.toString())
    else throw error
  }
}

async function getQuote(
  fromChainId: number,
  toChainId: number,
  token: Contract,
  amount: BigNumber,
  slippage: number
): Promise<QuoteResponse> {
  return axios.get(`${HOP_URL}/quote`, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    params: {
      fromChain: CHAINS[fromChainId],
      toChain: CHAINS[toChainId],
      token: await token.symbol(),
      amount: amount.toString(),
      slippage: slippage < 1 ? slippage * 100 : slippage,
    },
  })
}
