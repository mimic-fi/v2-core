import { TASK_TEST } from 'hardhat/builtin-tasks/task-names'
import { task, types } from 'hardhat/config'

import { overrideTestTaskForDeployments } from './src/tests'

task(TASK_TEST)
  .addOptionalParam('fork', 'Optional network name to be forked block number to fork in case of running fork tests.')
  .addOptionalParam('blockNumber', 'Optional block number to fork in case of running fork tests.', undefined, types.int)
  .setAction(overrideTestTaskForDeployments)
