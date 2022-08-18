import '@nomiclabs/hardhat-ethers'

export default {
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
