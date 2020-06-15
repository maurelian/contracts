const { expectEvent, expectRevert  } = require('@openzeppelin/test-helpers')

const constants = require('../utils/constants.js')
const timeUtils = require('../utils/time.js')
const ArtifactOwned = artifacts.require('Owned')

contract('Owned', function (accounts) {
  const OWNER = accounts[0]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3], accounts[4], accounts[5], accounts[6]]
  const RECEIVERS = [accounts[7]]
  const ENS_OWNER = accounts[8]
  const AUTHEREUM_OWNER = accounts[9]
  const LOGIN_KEY = accounts[10]

  // Test Params
  let snapshotId

  before(async () => {
    ownedInstance = await ArtifactOwned.new()
  })

  // Take snapshot before each test and revert after each test
  beforeEach(async() => {
    snapshotId = await timeUtils.takeSnapshot()
  })

  afterEach(async() => {
    await timeUtils.revertSnapshot(snapshotId.result)
  })

  //**********//
  //  Tests  //
  //********//

  describe('isOwner', () => {
    context('Happy Path', async () => {
      it('Should return true if the owner is passed in', async () => {
        const isOwner = await ownedInstance.isOwner.call(OWNER)
        assert.equal(isOwner, true)
      })
      it('Should return false if the owner is not passed in', async () => {
        const isOwner = await ownedInstance.isOwner.call(AUTHEREUM_OWNER)
        assert.equal(isOwner, false)
      })
    })
  })
  describe('changeOwner', () => {
    context('Happy Path', async () => {
      it('Should allow the owner to change the owner', async () => {
        var { logs } = await ownedInstance.changeOwner(AUTHEREUM_OWNER)

        const isOwner = await ownedInstance.isOwner.call(AUTHEREUM_OWNER)
        assert.equal(isOwner, true)

        expectEvent.inLogs(logs, 'OwnerChanged', { _newOwner: AUTHEREUM_OWNER })
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not allow a non-owner to change the owner', async () => {
        await expectRevert(ownedInstance.changeOwner(AUTHEREUM_OWNER, { from: AUTHEREUM_OWNER }), constants.REVERT_MSG.O_MUST_BE_OWNER)
      })
      it('Should not allow the owner to be set to 0', async () => {
        await expectRevert(ownedInstance.changeOwner(constants.ZERO_ADDRESS), constants.REVERT_MSG.O_NOT_NULL_ADDRESS)
      })
    })
  })
})
