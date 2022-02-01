import test from 'ava';
import {
  initWeb3Client,
  sendEthereumElectionsTransaction,
  sendEthereumVoteUnreadyTransaction,
  readPendingTransactionStatus,
  queryCanJoinCommittee,
} from './ethereum';
import Web3 from 'web3';
import { State, EthereumTxStatus } from '../model/state';
import { Contract } from 'web3-eth-contract';
import { sleep, getCurrentClockTime, getToday } from '../helpers';
import Signer from 'orbs-signer-client';
import { exampleConfig } from '../config.example';
import { TransactionReceipt } from 'web3-core';
import { getReceiptFeeInEth } from './ethereum-helpers';

test('initializes web3 and contracts', (t) => {
  const state = new State();
  initWeb3Client('http://ganache:7545', '0xf8B352100dE45D2668768290504DC89e85766E02', state);
  t.assert(state.web3);
  t.assert(state.ethereumElectionsContract);
});

function getMockWeb3Client(behavior: 'success' | 'badsend' | 'pending' | 'revert' | 'removed' | 'overmax' = 'success') {
  return ({
    eth: {
      getTransactionCount: async () => {
        await sleep(0);
        return 17;
      },
      getGasPrice: async () => {
        await sleep(0);
        if (behavior == 'overmax') return '999000000000';
        return '40000000000';
      },
      estimateGas: async () => {
        await sleep(0);
        return 500000;
      },
      sendSignedTransaction: async (_tx: unknown, callback: (err?: Error) => void) => {
        await sleep(0);
        if (behavior == 'badsend') callback(new Error('send error'));
        else callback();
      },
      getTransaction: async () => {
        await sleep(0);
        if (behavior == 'removed') return null;
        if (behavior == 'pending') return { blockNumber: null };
        else return { blockNumber: 117 };
      },
      getTransactionReceipt: async () => {
        await sleep(0);
        if (behavior == 'pending') return null;
        if (behavior != 'revert') return { status: true, blockNumber: 117 };
        else return { status: false, blockNumber: 117 };
      },
    },
  } as unknown) as Web3;
}

function getMockElectionsContract() {
  return ({
    options: {
      address: '0xaddress',
    },
    methods: {
      readyToSync: () => {
        return { encodeABI: () => '0xencodedAbi' };
      },
      readyForCommittee: () => {
        return { encodeABI: () => '0xencodedAbi' };
      },
      voteUnready: () => {
        return { encodeABI: () => '0xencodedAbi' };
      },
      canJoinCommittee: () => {
        return {
          call: async () => {
            await sleep(0);
            return true;
          },
        };
      },
    },
  } as unknown) as Contract;
}

function getMockSigner(successful = true) {
  return ({
    sign: async () => {
      await sleep(0);
      if (!successful) return {};
      return {
        rawTransaction: '0xrawTx',
        transactionHash: '0xtxHash',
      };
    },
  } as unknown) as Signer;
}

test('sendEthereumElectionsTransaction ready-for-committee successful after timeout', async (t) => {
  const state = new State();
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus([]);
  state.EthereumLastElectionsTx.Status = 'timeout';
  state.web3 = getMockWeb3Client();
  state.signer = getMockSigner();
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumElectionsTransaction('ready-for-committee', 'sender', state, exampleConfig);

  if (!state.EthereumLastElectionsTx) throw new Error(`EthereumLastElectionsTx not defined`);
  t.is(state.EthereumLastElectionsTx.LastPollTime, 0);
  t.is(state.EthereumLastElectionsTx.Type, 'ready-for-committee');
  t.assert(state.EthereumLastElectionsTx.SendTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.GasPriceStrategy, 'recommended');
  t.is(state.EthereumLastElectionsTx.GasPrice, 40000000000);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumLastElectionsTx.TxHash, '0xtxHash');
  t.is(state.EthereumLastElectionsTx.EthBlock, 0);
  t.falsy(state.EthereumLastElectionsTx.OnFinal);
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], undefined);
});

test('sendEthereumElectionsTransaction ready-for-committee successful with huge gas price', async (t) => {
  const state = new State();
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus([]);
  state.EthereumLastElectionsTx.Status = 'timeout';
  state.web3 = getMockWeb3Client('overmax');
  state.signer = getMockSigner();
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumElectionsTransaction('ready-for-committee', 'sender', state, exampleConfig);

  if (!state.EthereumLastElectionsTx) throw new Error(`EthereumLastElectionsTx not defined`);
  t.is(state.EthereumLastElectionsTx.LastPollTime, 0);
  t.is(state.EthereumLastElectionsTx.Type, 'ready-for-committee');
  t.assert(state.EthereumLastElectionsTx.SendTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.GasPriceStrategy, 'recommended');
  t.is(state.EthereumLastElectionsTx.GasPrice, exampleConfig.EthereumMaxGasPrice);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumLastElectionsTx.TxHash, '0xtxHash');
  t.is(state.EthereumLastElectionsTx.EthBlock, 0);
  t.falsy(state.EthereumLastElectionsTx.OnFinal);
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], undefined);
});

test('sendEthereumElectionsTransaction fails on send', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client('badsend');
  state.signer = getMockSigner();
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumElectionsTransaction('ready-to-sync', 'sender', state, exampleConfig);

  if (!state.EthereumLastElectionsTx) throw new Error(`EthereumLastElectionsTx not defined`);
  t.assert(state.EthereumLastElectionsTx.SendTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.Status, 'failed-send');
});

test('sendEthereumElectionsTransaction fails on sign', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client();
  state.signer = getMockSigner(false);
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumElectionsTransaction('ready-to-sync', 'sender', state, exampleConfig);

  if (!state.EthereumLastElectionsTx) throw new Error(`EthereumLastElectionsTx not defined`);
  t.assert(state.EthereumLastElectionsTx.SendTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.Status, 'failed-send');
});

test('sendEthereumVoteUnreadyTransaction successful after failed send', async (t) => {
  const state = new State();
  state.EthereumLastVoteUnreadyTx = getExampleEthereumTxStatus([]);
  state.EthereumLastVoteUnreadyTx.Status = 'failed-send';
  state.ManagementRefTime = 99999;
  state.web3 = getMockWeb3Client();
  state.signer = getMockSigner();
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumVoteUnreadyTransaction([{ EthAddress: 'abc', Weight: 10 }], 'sender', state, exampleConfig);

  if (!state.EthereumLastVoteUnreadyTx) throw new Error(`EthereumLastVoteUnreadyTx not defined`);
  t.is(state.EthereumLastVoteUnreadyTx.LastPollTime, 0);
  t.is(state.EthereumLastVoteUnreadyTx.Type, 'vote-unready');
  t.assert(state.EthereumLastVoteUnreadyTx.SendTime > 1400000000);
  t.is(state.EthereumLastVoteUnreadyTx.GasPriceStrategy, 'recommended');
  t.is(state.EthereumLastVoteUnreadyTx.GasPrice, 40000000000);
  t.is(state.EthereumLastVoteUnreadyTx.Status, 'pending');
  t.is(state.EthereumLastVoteUnreadyTx.TxHash, '0xtxHash');
  t.is(state.EthereumLastVoteUnreadyTx.EthBlock, 0);
  t.truthy(state.EthereumLastVoteUnreadyTx.OnFinal);
  t.falsy(state.EthereumLastVoteUnreadyTime['abc']);
  state.EthereumLastVoteUnreadyTx.OnFinal?.();
  t.is(state.EthereumLastVoteUnreadyTime['abc'], 99999);
});

test('sendEthereumVoteUnreadyTransaction with no targets', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client();
  state.signer = getMockSigner();
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumVoteUnreadyTransaction([], 'sender', state, exampleConfig);
  t.falsy(state.EthereumLastVoteUnreadyTx);
});

test('sendEthereumVoteUnreadyTransaction fails on send', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client('badsend');
  state.signer = getMockSigner();
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumVoteUnreadyTransaction([{ EthAddress: 'abc', Weight: 10 }], 'sender', state, exampleConfig);

  if (!state.EthereumLastVoteUnreadyTx) throw new Error(`EthereumLastVoteUnreadyTx not defined`);
  t.assert(state.EthereumLastVoteUnreadyTx.SendTime > 1400000000);
  t.is(state.EthereumLastVoteUnreadyTx.Status, 'failed-send');
});

test('sendEthereumVoteUnreadyTransaction fails on sign', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client();
  state.signer = getMockSigner(false);
  state.ethereumElectionsContract = getMockElectionsContract();
  await sendEthereumVoteUnreadyTransaction([{ EthAddress: 'abc', Weight: 10 }], 'sender', state, exampleConfig);

  if (!state.EthereumLastVoteUnreadyTx) throw new Error(`EthereumLastVoteUnreadyTx not defined`);
  t.assert(state.EthereumLastVoteUnreadyTx.SendTime > 1400000000);
  t.is(state.EthereumLastVoteUnreadyTx.Status, 'failed-send');
});

// reflects a tx status for a recent pending tx that already has tx hash but no block number
function getExampleEthereumTxStatus(arr: number[]): EthereumTxStatus {
  return {
    LastPollTime: 0,
    Type: 'ready-to-sync',
    SendTime: getCurrentClockTime(),
    GasPriceStrategy: 'discount',
    GasPrice: 30000000000,
    Status: 'pending',
    TxHash: 'abc',
    EthBlock: 0,
    OnFinal: () => {
      arr.push(1);
    },
  };
}

test('readPendingTransactionStatus on a recent pending tx that still has no txHash', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client('pending');
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumLastElectionsTx.TxHash = '';
  state.EthereumConsecutiveTxTimeouts = 3;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime == 0);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumConsecutiveTxTimeouts, 3);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on an old pending tx that still has no txHash', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client('pending');
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumLastElectionsTx.TxHash = '';
  state.EthereumLastElectionsTx.SendTime = getCurrentClockTime() - 24 * 60 * 60;
  state.EthereumConsecutiveTxTimeouts = 3;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime == 0);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumConsecutiveTxTimeouts, 3);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on a recent pending tx that has txHash but no block', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client('pending');
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumConsecutiveTxTimeouts = 3;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumConsecutiveTxTimeouts, 3);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on an old pending tx that has txHash but no block', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client('pending');
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumLastElectionsTx.SendTime = getCurrentClockTime() - 24 * 60 * 60;
  state.EthereumConsecutiveTxTimeouts = 3;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.Status, 'timeout');
  t.is(state.EthereumConsecutiveTxTimeouts, 4);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on a recent pending tx that becomes committed in block', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client('success');
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumConsecutiveTxTimeouts = 3;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumLastElectionsTx.EthBlock, 117);
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], 2);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on an old pending tx that becomes committed in block', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client('success');
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumLastElectionsTx.SendTime = getCurrentClockTime() - 24 * 60 * 60;
  state.EthereumConsecutiveTxTimeouts = 3;
  // state.EthereumCommittedTxStats[getToday()] does not exist
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumLastElectionsTx.EthBlock, 117);
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on a recent pending tx that becomes removed from pool', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client('removed');
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumConsecutiveTxTimeouts = 3;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.Status, 'pending'); // this used to return error
  t.is(state.EthereumConsecutiveTxTimeouts, 3);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on a recent pending tx that becomes reverted in block', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client('revert');
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumConsecutiveTxTimeouts = 3;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime > 1400000000);
  t.is(state.EthereumLastElectionsTx.Status, 'revert');
  t.is(state.EthereumLastElectionsTx.EthBlock, 117);
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], 2);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on a recent pending tx committed in block but not final', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client('success');
  state.ManagementEthRefBlock = 100;
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumLastElectionsTx.EthBlock = 117;
  state.EthereumConsecutiveTxTimeouts = 0;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime == 0);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on an old pending tx committed in block but not final', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client('success');
  state.ManagementEthRefBlock = 100;
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumLastElectionsTx.SendTime = getCurrentClockTime() - 24 * 60 * 60;
  state.EthereumLastElectionsTx.EthBlock = 117;
  state.EthereumConsecutiveTxTimeouts = 0;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime == 0);
  t.is(state.EthereumLastElectionsTx.Status, 'pending');
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 0);
});

test('readPendingTransactionStatus on a recent pending tx committed in block that becomes final', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client('success');
  state.ManagementEthRefBlock = 122;
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumLastElectionsTx.EthBlock = 117;
  state.EthereumConsecutiveTxTimeouts = 0;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime == 0);
  t.is(state.EthereumLastElectionsTx.Status, 'final');
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 1);
});

test('readPendingTransactionStatus on an old pending tx committed in block that becomes final', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client('success');
  state.ManagementEthRefBlock = 122;
  const arr: number[] = [];
  state.EthereumLastElectionsTx = getExampleEthereumTxStatus(arr);
  state.EthereumLastElectionsTx.SendTime = getCurrentClockTime() - 24 * 60 * 60;
  state.EthereumLastElectionsTx.EthBlock = 117;
  state.EthereumConsecutiveTxTimeouts = 0;
  state.EthereumCommittedTxStats[getToday()] = 1;
  await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, exampleConfig);

  t.assert(state.EthereumLastElectionsTx.LastPollTime == 0);
  t.is(state.EthereumLastElectionsTx.Status, 'final');
  t.is(state.EthereumConsecutiveTxTimeouts, 0);
  t.is(state.EthereumCommittedTxStats[getToday()], 1);
  t.is(arr.length, 1);
});

test('getReceiptFeeInEth', (t) => {
  const mockReceipt: TransactionReceipt = ({
    gasUsed: 258406,
  } as unknown) as TransactionReceipt;
  const mockStatus: EthereumTxStatus = ({
    GasPrice: 65000000000,
  } as unknown) as EthereumTxStatus;
  t.is(getReceiptFeeInEth(mockReceipt, mockStatus), 0.01679639);
});

test('queryCanJoinCommittee works', async (t) => {
  const state = new State();
  state.web3 = getMockWeb3Client();
  state.ethereumElectionsContract = getMockElectionsContract();

  t.is(await queryCanJoinCommittee(exampleConfig.NodeOrbsAddress, state), true);
});
