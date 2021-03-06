pragma solidity 0.5.17;
pragma experimental ABIEncoderV2;

import './IERC1271.sol';
import './IERC721Receiver.sol';
import './IERC1155TokenReceiver.sol';
import './IERC1820ImplementerInterface.sol';
import './IERC777TokensRecipient.sol';

contract IAuthereumAccount is IERC1271, IERC721Receiver, IERC1155TokenReceiver, IERC1820ImplementerInterface, IERC777TokensRecipient {
    function () external payable;
    function name() external view returns (string memory);
    function version() external view returns (string memory);
    function implementation() external view returns (address);
    function lastInitializedVersion() external returns (uint256);
    function authKeys(address _authKey) external returns (bool);
    function nonce() external returns (uint256);
    function numAuthKeys() external returns (uint256);
    function getChainId() external pure returns (uint256);
    function addAuthKey(address _authKey) external;
    function upgradeToAndCall(address _newImplementation, bytes calldata _data) external;
    function removeAuthKey(address _authKey) external;
    function isValidAuthKeySignature(bytes32 _messageHash, bytes calldata _signature) external view returns (bool);
    function isValidLoginKeySignature(bytes32 _messageHash, bytes calldata _signature) external view returns (bool);
    function executeMultipleTransactions(bytes[] calldata _transactions) external returns (bytes[] memory);
    function executeMultipleMetaTransactions(bytes[] calldata _transactions) external returns (bytes[] memory);

    function executeMultipleAuthKeyMetaTransactions(
        bytes[] calldata _transactions,
        uint256 _gasPrice,
        uint256 _gasOverhead,
        address _feeTokenAddress,
        uint256 _feeTokenRate,
        bytes calldata _transactionMessageHashSignature
    ) external returns (bytes[] memory);

    function executeMultipleLoginKeyMetaTransactions(
        bytes[] calldata _transactions,
        uint256 _gasPrice,
        uint256 _gasOverhead,
        bytes calldata _loginKeyRestrictionsData,
        address _feeTokenAddress,
        uint256 _feeTokenRate,
        bytes calldata _transactionMessageHashSignature,
        bytes calldata _loginKeyAttestationSignature
    ) external returns (bytes[] memory);
}
