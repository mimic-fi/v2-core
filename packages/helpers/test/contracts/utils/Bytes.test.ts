import { expect } from 'chai'
import { Contract } from 'ethers'
import { hexlify, hexZeroPad } from 'ethers/lib/utils'

import { deploy } from '../../../'

describe('Bytes', () => {
  let library: Contract

  beforeEach('deploy lib', async () => {
    library = await deploy('BytesMock')
  })

  describe('concat', () => {
    const array = '0xabcdef'

    it('concatenates an address with a bytes array', async () => {
      const address = '0xffffffffffffffffffffffffffffffffffffffff'
      const result = await library.concat1(array, address)

      expect(result).to.be.equal(array + address.slice(2))
    })

    it('concatenates an uint24 with a bytes array', async () => {
      const number = 5
      const result = await library.concat2(array, number)

      expect(result).to.be.equal(array + hexZeroPad(hexlify(number), 3).slice(2))
    })
  })
})
