import { bn, currentTimestamp, MINUTE, pct } from '@mimic-fi/v2-helpers'
import axios, { AxiosError } from 'axios'
import { BigNumber, Contract } from 'ethers'
import { ethers } from 'hardhat'

const PARASWAP_URL = 'https://apiv5.paraswap.io'

export type PricesResponse = { data: { priceRoute: { [key: string]: string } } }

export type TransactionsResponse = { data: { data: string; sig: string; signer: string } }

export type SwapData = { minAmountOut: BigNumber; data: string; sig: string; signer: string }

export async function getSwapData(
  sender: Contract,
  tokenIn: Contract,
  tokenOut: Contract,
  amountIn: BigNumber,
  slippage: number
): Promise<SwapData> {
  const prices = await getPrices(sender, tokenIn, tokenOut, amountIn)
  const priceRoute = prices.data.priceRoute

  try {
    const transactions = await postTransactions(sender, tokenIn, tokenOut, amountIn, slippage, priceRoute)
    const minAmountOut = bn(priceRoute.destAmount).sub(pct(bn(priceRoute.destAmount), slippage))
    return { data: transactions.data.data, minAmountOut, sig: transactions.data.sig, signer: transactions.data.signer }
  } catch (error) {
    if (error instanceof AxiosError) throw Error(error.toString() + ' - ' + error.response?.data?.error)
    else throw error
  }
}

export async function getPrices(
  sender: Contract,
  tokenIn: Contract,
  tokenOut: Contract,
  amountIn: BigNumber
): Promise<PricesResponse> {
  return axios.get(`${PARASWAP_URL}/prices`, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    params: {
      srcToken: tokenIn.address,
      srcDecimals: await tokenIn.decimals(),
      destToken: tokenOut.address,
      destDecimals: await tokenOut.decimals(),
      amount: amountIn.toString(),
      side: 'SELL',
      network: '1',
      userAddress: sender.address,
    },
  })
}

export async function postTransactions(
  sender: Contract,
  tokenIn: Contract,
  tokenOut: Contract,
  amountIn: BigNumber,
  slippage: number,
  priceRoute: { [key: string]: string }
): Promise<TransactionsResponse> {
  return axios.post(
    `${PARASWAP_URL}/transactions/1`,
    {
      srcToken: tokenIn.address,
      destToken: tokenOut.address,
      srcAmount: amountIn.toString(),
      srcDecimals: await tokenIn.decimals(),
      destDecimals: await tokenOut.decimals(),
      slippage: slippage * 10000,
      userAddress: sender.address,
      receiver: sender.address,
      deadline: (await currentTimestamp()).add(MINUTE).toString(),
      priceRoute,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      params: {
        gasPrice: (await ethers.provider.getGasPrice()).toString(),
        signCalldata: true,
        ignoreChecks: true,
      },
    }
  )
}
