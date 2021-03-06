const isValidSignature = require('is-valid-signature')
const { expectRevert } = require('@openzeppelin/test-helpers')

const utils = require('../utils/utils')
const constants = require('../utils/constants.js')
const timeUtils = require('../utils/time.js')

const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactAuthereumProxyFactory = artifacts.require('AuthereumProxyFactory')
const ArtifactAuthereumRecoveryModule = artifacts.require('AuthereumRecoveryModule')
const ArtifactERC1820Registry = artifacts.require('ERC1820Registry')

const { AUTH_KEY_0_PRIV_KEY, LOGIN_KEY_0_PRIV_KEY } = require('../utils/constants.js')

contract('ERC1271Account', function (accounts) {
  const AUTH_KEYS = [accounts[1]]
  const AUTHEREUM_OWNER = accounts[9]
  const LOGIN_KEY = accounts[10]
  const VALID_SIG = '0x1626ba7e'
  const VALID_SIG_BYTES = '0x20c13b0b'
  const INVALID_SIG = '0xffffffff'

  // Test Params
  let beforeAllSnapshotId
  let snapshotId

  // Proxy Creation Params
  let expectedSalt

  // Addresses
  let expectedAddress

  // Logic Addresses
  let authereumProxyFactoryLogicContract
  let authereumAccountLogicContract

  // Contract Instances
  let authereumRecoveryModule
  let authereumProxyAccount
  let erc1820Registry

  before(async () => {

    // Take snapshot to reset to a known state
    // This is required due to the deployment of the 1820 contract
    beforeAllSnapshotId = await timeUtils.takeSnapshot()
    
    // Deploy the recovery module
    authereumRecoveryModule = await ArtifactAuthereumRecoveryModule.new()

    // Deploy the 1820 contract
    await utils.deploy1820Contract(AUTHEREUM_OWNER)

    // Set up ENS defaults
    const { authereumEnsManager } = await utils.setENSDefaults(AUTHEREUM_OWNER)

    // Create Logic Contracts
    authereumAccountLogicContract = await ArtifactAuthereumAccount.new()
    const _proxyInitCode = await utils.getProxyBytecode()
    authereumProxyFactoryLogicContract = await ArtifactAuthereumProxyFactory.new(_proxyInitCode, authereumEnsManager.address)

    // Set up Authereum ENS Manager defaults
    await utils.setAuthereumENSManagerDefaults(authereumEnsManager, AUTHEREUM_OWNER, authereumProxyFactoryLogicContract.address, constants.AUTHEREUM_PROXY_RUNTIME_CODE_HASH)

    // Create default proxies
    expectedSalt = constants.SALT
    label = constants.DEFAULT_LABEL

    expectedAddress = await utils.createDefaultProxy(
      expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
      AUTH_KEYS[0], label, authereumAccountLogicContract.address
    )

    // Set up IERC1820 contract
    erc1820Registry = await ArtifactERC1820Registry.at(constants.ERC1820_REGISTRY_ADDRESS)

    // Wrap in truffle-contract
    authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)

    // Handle post-proxy deployment
    await authereumProxyAccount.sendTransaction({ value:constants.TWO_ETHER, from: AUTH_KEYS[0] })
    await utils.setAuthereumRecoveryModule(authereumProxyAccount, authereumRecoveryModule.address, AUTH_KEYS[0])
  })

  after(async() => {
    await timeUtils.revertSnapshot(beforeAllSnapshotId.result)
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

  describe('isValidSignature', () => {
    context('Happy Path', async () => {
      it('Should return the magic value for a login key signature', async () => {
        const msg = 'Hello, World!'
        const msgBytes = utils.stringToBytes(msg)
        const { msgHash, msgHashSignature } = utils.getSignedMessageData(msg, LOGIN_KEY_0_PRIV_KEY)
        const loginKeyRestrictionsData = web3.eth.abi.encodeParameter('uint256', 1673256750) // Arbitrary expiration time
        const signingKeyAuthorizationSignature = utils.getSignedLoginKey(LOGIN_KEY, loginKeyRestrictionsData)

        // Concat loginKeyRestrictionsData, signingKeyAuthorizationSignature, and loginKeyRestrictionsData
        let combinedSignature = utils.concatHex(
          msgHashSignature,
          signingKeyAuthorizationSignature
        )
        combinedSignature = utils.concatHex(
          combinedSignature,
          loginKeyRestrictionsData
        )

        // is-valid-signature package interaction (calls isValidSignature())
        assert.equal(await isValidSignature(authereumProxyAccount.address, msg, combinedSignature, web3), true)

        // Try both isValidSignature calls
        assert.equal(await makeIsValidSignatureBytes32Call(msgHash, combinedSignature, authereumProxyAccount.address), VALID_SIG)
        assert.equal(await authereumProxyAccount.isValidSignature(msgBytes, combinedSignature), VALID_SIG_BYTES)
        // Check that the individual call is valid
        assert.equal(await authereumProxyAccount.isValidLoginKeySignature(msgHash, combinedSignature), true)
      })
      it('Should return the magic value for an auth key signature', async () => {
        const msg = 'Hello, World!'
        const msgBytes = utils.stringToBytes(msg)
        const { msgHash, msgHashSignature } = utils.getSignedMessageData(msg, AUTH_KEY_0_PRIV_KEY)

        // is-valid-signature package interaction (calls isValidSignature())
        assert.equal(await isValidSignature(authereumProxyAccount.address, msg, msgHashSignature, web3), true)

        // Try both isValidSignature calls
        assert.equal(await makeIsValidSignatureBytes32Call(msgHash, msgHashSignature, authereumProxyAccount.address), VALID_SIG)
        assert.equal(await authereumProxyAccount.isValidSignature(msgBytes, msgHashSignature), VALID_SIG_BYTES)
        // Check that the individual call is valid
        assert.equal(await authereumProxyAccount.isValidAuthKeySignature(msgHash, msgHashSignature), true)
      })
      it('Should return INVALID_SIG for isValidLoginKeySignature() due to a signature of length > 130 but bad data', async () => {
        const msg = 'Hello, World!'
        const badMsg = 'Goodbye, World!'
        const badMsgBytes = utils.stringToBytes(badMsg)
        const { msgHash, msgHashSignature } = utils.getSignedMessageData(msg, LOGIN_KEY_0_PRIV_KEY)
        const loginKeyRestrictionsData = web3.eth.abi.encodeParameter('uint256', 1673256750) // Arbitrary expiration time
        const signingKeyAuthorizationSignature = utils.getSignedLoginKey(LOGIN_KEY, loginKeyRestrictionsData)
        const combinedSignature = utils.concatHex(
          msgHashSignature,
          signingKeyAuthorizationSignature,
          loginKeyRestrictionsData
        )
        const badCombinedSignature = combinedSignature + 'ab'

        // is-valid-signature package interaction (calls isValidSignature())
        assert.equal(await isValidSignature(authereumProxyAccount.address, badMsg, badCombinedSignature, web3), false)

        // Try both isValidSignature calls
        assert.equal(await makeIsValidSignatureBytes32Call(msgHash, combinedSignature, authereumProxyAccount.address), INVALID_SIG)
        assert.equal(await authereumProxyAccount.isValidSignature(badMsgBytes, badCombinedSignature), INVALID_SIG)
        // Check that the individual call is valid
        assert.equal(await authereumProxyAccount.isValidLoginKeySignature(msgHash, badCombinedSignature), false)
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not return the magic value for a login key signature due to bad message', async () => {
        const msg = 'Hello, World!'
        const badMsg = 'Goodbye, World!'
        const badMsgBytes = utils.stringToBytes(badMsg)
        const { msgHash, msgHashSignature } = utils.getSignedMessageData(msg, LOGIN_KEY_0_PRIV_KEY)
        const { msgHash: badMsgHash } = utils.getSignedMessageData(badMsg, LOGIN_KEY_0_PRIV_KEY)
        const loginKeyRestrictionsData = web3.eth.abi.encodeParameter('uint256', 1673256750) // Arbitrary expiration time
        const signingKeyAuthorizationSignature = utils.getSignedLoginKey(LOGIN_KEY, loginKeyRestrictionsData)
        const combinedSignature = utils.concatHex(
          msgHashSignature,
          signingKeyAuthorizationSignature,
          loginKeyRestrictionsData
        )

        // is-valid-signature package interaction (calls isValidSignature())
        assert.equal(await isValidSignature(authereumProxyAccount.address, badMsg, combinedSignature, web3), false)

        // Try both isValidSignature calls
        assert.equal(await makeIsValidSignatureBytes32Call(badMsgHash, combinedSignature, authereumProxyAccount.address), INVALID_SIG)
        assert.equal(await authereumProxyAccount.isValidSignature(badMsgBytes, combinedSignature), INVALID_SIG)
        // Check that the individual call is valid
        assert.equal(await authereumProxyAccount.isValidLoginKeySignature(msgHash, combinedSignature), false)
      })
      it('Should not return the magic value for an auth key signature due to bad message', async () => {
        const msg = 'Hello, World!'
        const badMsg = 'Goodbye, World!'
        const badMsgBytes = utils.stringToBytes(badMsg)
        const { msgHash, msgHashSignature } = utils.getSignedMessageData(msg, LOGIN_KEY_0_PRIV_KEY)
        const { msgHash: badMsgHash } = utils.getSignedMessageData(badMsg, LOGIN_KEY_0_PRIV_KEY)

        // is-valid-signature package interaction (calls isValidSignature())
        assert.equal(await isValidSignature(authereumProxyAccount.address, badMsg, msgHashSignature, web3), false)

        // Try both isValidSignature calls
        assert.equal(await makeIsValidSignatureBytes32Call(badMsgHash, msgHashSignature, authereumProxyAccount.address), INVALID_SIG)
        assert.equal(await authereumProxyAccount.isValidSignature(badMsgBytes, msgHashSignature), INVALID_SIG)
        // Check that the individual call is valid
        assert.equal(await authereumProxyAccount.isValidAuthKeySignature(msgHash, msgHashSignature), false)
      })
      it('Should revert isValidSignature() due to a signature of length < 65', async () => {
        const msg = 'Hello, World!'
        const msgBytes = utils.stringToBytes(msg)
        const { msgHash, msgHashSignature } = utils.getSignedMessageData(msg, LOGIN_KEY_0_PRIV_KEY)
        // Remove 2 in order to remove a whole byte. If a single character is removed, then the bytes length is still registered the same as if none were removed
        const badMsgHashSignature = msgHashSignature.substring(0, msgHashSignature.length - 2)

        // is-valid-signature package interaction (calls isValidSignature())
        await expectRevert(isValidSignature(authereumProxyAccount.address, msg, badMsgHashSignature, web3), constants.REVERT_MSG.ERC1271_INVALID_SIG)

        // Try both isValidSignature calls
        await expectRevert(makeIsValidSignatureBytes32Call(msgHash, badMsgHashSignature, authereumProxyAccount.address), constants.REVERT_MSG.ERC1271_INVALID_SIG_LENGTH)
        await expectRevert(authereumProxyAccount.isValidSignature(msgBytes, badMsgHashSignature), constants.REVERT_MSG.ERC1271_INVALID_SIG_LENGTH)
      })
      it('Should revert isValidSignature() due to a signature of length > 65 and < 130', async () => {
        const msg = 'Hello, World!'
        const msgBytes = utils.stringToBytes(msg)
        const { msgHash, msgHashSignature } = utils.getSignedMessageData(msg, AUTH_KEY_0_PRIV_KEY)
        const badMsgHashSignature = msgHashSignature + 'ab'

        // is-valid-signature package interaction (calls isValidSignature)
        await expectRevert(isValidSignature(authereumProxyAccount.address, msg, badMsgHashSignature, web3), constants.REVERT_MSG.ERC1271_INVALID_SIG)

        // Try both isValidSignature calls
        await expectRevert(makeIsValidSignatureBytes32Call(msgHash, badMsgHashSignature, authereumProxyAccount.address), constants.REVERT_MSG.ERC1271_INVALID_SIG_LENGTH)
        await expectRevert(authereumProxyAccount.isValidSignature(msgBytes, badMsgHashSignature), constants.REVERT_MSG.ERC1271_INVALID_SIG_LENGTH)
      })
      it('Should revert isValidAuthKeySignature() due to a signature of length != 65', async () => {
        const msg = 'Hello, World!'
        const msgBytes = utils.stringToBytes(msg)
        const { msgHashSignature } = utils.getSignedMessageData(msg, AUTH_KEY_0_PRIV_KEY)
        // Remove 2 in order to remove a whole byte. If a single character is removed, then the bytes length is still registered the same as if none were removed
        const badMsgHashSignature = msgHashSignature.substring(0, msgHashSignature.length - 2)

        // NOTE: the is-valid-signature package does not interact directly with isValidAuthKeySignature()

        // Direct contract interaction (calls isValidAuthKeySignature())
        await expectRevert(authereumProxyAccount.isValidAuthKeySignature(msgBytes, badMsgHashSignature), constants.REVERT_MSG.ERC1271_INVALID_AUTH_KEY_SIG)
      })
      it('Should revert isValidLoginKeySignature() due to a signature of length < 130', async () => {
        const msg = 'Hello, World!'
        const msgBytes = utils.stringToBytes(msg)
        const { msgHashSignature } = utils.getSignedMessageData(msg, AUTH_KEY_0_PRIV_KEY)
        // Remove 2 in order to remove a whole byte. If a single character is removed, then the bytes length is still registered the same as if none were removed
        const badMsgHashSignature = msgHashSignature.substring(0, msgHashSignature.length - 2)

        // NOTE: the is-valid-signature package does not interact directly with isValidLoginKeySignature()

        // Direct contract interaction (calls isValidLoginKeySignature())
        await expectRevert(authereumProxyAccount.isValidLoginKeySignature(msgBytes, badMsgHashSignature), constants.REVERT_MSG.ERC1271_INVALID_LOGIN_KEY_SIG)
      })
    })
  })

  /**
   * Utils
   */

  async function makeIsValidSignatureBytes32Call(messageHash, signature, authereumProxyAccountAddress) {
    // This method is required as there is a bug somewhere in web3.js and/or
    // truffle that does not handle function name collisions well.
    // Calling `isValidSignature(bytes32,bytes)` is not possible (AFAIK)
    // as long as `isValidSignature(bytes,bytes)` exists on the contract.
    const data = web3.eth.abi.encodeFunctionCall({
      name: 'isValidSignature',
      type: 'function',
      inputs: [{
        type: 'bytes32',
        name: '_messageHash'
      }, {
        type: 'bytes',
        name: '_signature'
      }]
    }, [messageHash, signature])

     const returnData = await web3.eth.call({to: authereumProxyAccountAddress, data })
     return returnData.substring(0,10)
  }
})
