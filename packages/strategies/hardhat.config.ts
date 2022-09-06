import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import 'hardhat-local-networks-config-plugin'

import { overrideFunctions } from '@mimic-fi/v2-helpers'
import { TASK_COMPILE } from 'hardhat/builtin-tasks/task-names'
import { task } from 'hardhat/config'
import { homedir } from 'os'
import path from 'path'

task(TASK_COMPILE).setAction(overrideFunctions(['query']))

export default {
  localNetworksConfig: path.join(homedir(), '/.hardhat/networks.mimic.json'),
  solidity: {
    version: '0.8.3',
    settings: {
      optimizer: {
        enabled: true,
        runs: 10000,
      },
    },
  },
}
