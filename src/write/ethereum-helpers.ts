import * as Logger from '../logger';
import { State, EthereumTxStatus, GasPriceStrategy } from '../model/state';
import { getCurrentClockTime, jsonStringifyComplexTypes, toNumber } from '../helpers';
import { TransactionConfig, TransactionReceipt } from 'web3-core';

const GAS_LIMIT_ESTIMATE_EXTRA = 300000;
const GAS_LIMIT_HARD_LIMIT = 2000000;

export type Type = 'ready-to-sync' | 'ready-for-committee';

export interface EthereumTxParams {
  EthereumDiscountGasPriceFactor: number;
  EthereumDiscountTxTimeoutSeconds: number;
  EthereumNonDiscountTxTimeoutSeconds: number;
  EthereumMaxGasPrice: number;
  VoteUnreadyValiditySeconds: number;
  SuspendVoteUnready: boolean;
}

export function getGasPriceStrategy(previousTxStatus: EthereumTxStatus | undefined): GasPriceStrategy {
  if (!previousTxStatus) return 'discount';
  if (previousTxStatus.Status == 'final') return 'discount';
  return 'recommended';
}

export async function calcGasPrice(
  strategy: GasPriceStrategy,
  state: State,
  config: EthereumTxParams
): Promise<number> {
  if (!state.web3) throw new Error('Cannot calc gas price until web3 client is initialized.');

  const recommendedGasPrice = parseInt(await state.web3.eth.getGasPrice());
  if (recommendedGasPrice <= 0) {
    throw new Error(`Cannot retrieve recommended gas price.`);
  }

  let res = recommendedGasPrice;
  if (strategy == 'discount') res = Math.round(config.EthereumDiscountGasPriceFactor * recommendedGasPrice);
  if (res > config.EthereumMaxGasPrice) {
    Logger.error(`Gas price ${res} surpassed maximum allowed ${config.EthereumMaxGasPrice}.`);
    res = config.EthereumMaxGasPrice;
  }
  return res;
}

export async function signAndSendTransaction(
  encodedAbi: string,
  contractAddress: string,
  senderAddress: string,
  gasPrice: number,
  state: State
): Promise<string> {
  if (!state.web3) throw new Error('Cannot send tx until web3 client is initialized.');
  if (!state.signer) throw new Error('Cannot send tx until signer is initialized.');

  const nonce = await state.web3.eth.getTransactionCount(senderAddress, 'latest'); // ignore pending pool

  const txObject: TransactionConfig = {
    from: senderAddress,
    to: contractAddress,
    gasPrice: gasPrice,
    data: encodedAbi,
    nonce: nonce,
  };

  Logger.log(`About to estimate gas for tx object: ${jsonStringifyComplexTypes(txObject)}.`);

  let gasLimit = toNumber(await state.web3.eth.estimateGas(txObject));
  if (gasLimit <= 0) {
    throw new Error(`Cannot estimate gas for tx with data ${encodedAbi}.`);
  }
  gasLimit += GAS_LIMIT_ESTIMATE_EXTRA;
  if (gasLimit > GAS_LIMIT_HARD_LIMIT) {
    throw new Error(`Gas limit estimate ${gasLimit} over hard limit ${GAS_LIMIT_HARD_LIMIT}.`);
  }
  txObject.gas = gasLimit;

  Logger.log(`About to sign and send tx object: ${jsonStringifyComplexTypes(txObject)}.`);

  const { rawTransaction, transactionHash } = await state.signer.sign(txObject);
  if (!rawTransaction || !transactionHash) {
    throw new Error(`Could not sign tx object: ${jsonStringifyComplexTypes(txObject)}.`);
  }

  const web3 = state.web3;
  return new Promise<string>((resolve, reject) => {
    // normally this returns a promise that resolves on receipt, but we ignore this mechanism and have our own
    web3.eth
      .sendSignedTransaction(rawTransaction, (err) => {
        if (err) reject(err);
        else resolve(transactionHash);
      })
      .catch(() => {
        // do nothing (ignore the web3 promise)
      });
  });
}

export function handlePendingTxTimeout(status: EthereumTxStatus | undefined, state: State, config: EthereumTxParams) {
  if (!status) return;
  if (status.EthBlock > 0) return; // committed
  if (status.Status != 'pending') return;

  const now = getCurrentClockTime();
  const timeout =
    status.GasPriceStrategy == 'discount'
      ? config.EthereumDiscountTxTimeoutSeconds
      : config.EthereumNonDiscountTxTimeoutSeconds;
  if (now - status.SendTime > timeout) {
    Logger.error(`Last ethereum ${status.Type} tx ${status.TxHash} timed out with gas price ${status.GasPrice}.`);
    status.Status = 'timeout';
    state.EthereumConsecutiveTxTimeouts++;
  }
}

export function getReceiptFeeInEth(receipt: TransactionReceipt, status: EthereumTxStatus): number {
  return ((status.GasPrice / 1e9) * receipt.gasUsed) / 1e9;
}
