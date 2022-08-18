import fs from 'fs'
import { HardhatRuntimeEnvironment, RunSuperFunction } from 'hardhat/types'
import path from 'path'

const DIRECTORIES = ['artifacts']

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

export function overrideFunctions(functions: string[]) {
  return async (args: any, env: HardhatRuntimeEnvironment, run: RunSuperFunction<any>): Promise<any> => {
    const result = await run()
    DIRECTORIES.forEach((directory) => traverseDirectory(directory, functions))
    return result
  }
}

function traverseDirectory(directory: string, functions: string[]): void {
  fs.readdirSync(directory).forEach((file) => {
    const filePath = path.join(directory, file)
    if (fs.statSync(filePath).isDirectory()) traverseDirectory(filePath, functions)
    else if (path.extname(filePath) === '.json') tryOverridingABI(filePath, functions)
  })
}

function tryOverridingABI(filePath: string, functions: string[]): void {
  const data = fs.readFileSync(filePath)
  const content = JSON.parse(data.toString())

  if (Array.isArray(content.abi)) {
    content.abi.forEach((item: any, i: number) => {
      if (shouldOverwriteItem(item, functions)) {
        content.abi[i] = Object.assign({}, item, { stateMutability: 'view' })
      }
    })

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2))
  }
}

function shouldOverwriteItem(item: any, functions: string[]): boolean {
  const { type, name, stateMutability } = item
  if (!type || !name || !stateMutability) return false
  return type === 'function' && stateMutability === 'nonpayable' && functions.includes(name)
}
