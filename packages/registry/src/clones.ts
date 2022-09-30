import { assertEvent, deploy, instanceAt } from '@mimic-fi/v2-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { Contract } from 'ethers'

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function createClone(
  registry: Contract,
  admin: SignerWithAddress,
  contractName: string,
  args: Array<any> = [],
  initArgs?: Array<any>
): Promise<Contract> {
  const implementation = await deploy(contractName, args)
  await registry.connect(admin).register(await implementation.NAMESPACE(), implementation.address, false)

  const initializeData = initArgs ? implementation.interface.encodeFunctionData('initialize', initArgs) : '0x'
  const tx = await registry.clone(implementation.address, initializeData)
  const event = await assertEvent(tx, 'Cloned', { implementation })
  return instanceAt(contractName, event.args.instance)
}
