export const incrementBlocks = async (blocks: number): Promise<void> => {
  const { ethers } = await import('hardhat')
  for (let i = 0; i < blocks; i++) await ethers.provider.send('evm_mine', [])
}
