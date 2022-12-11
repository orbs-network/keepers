import Web3 from 'web3';
import * as Logger from './logger';
import { TxData } from "@ethereumjs/tx";
import { debugSign } from "./debugSigner";
import Signer from 'orbs-signer-client';
import { toNumber, jsonStringifyComplexTypes } from './helpers';
import { sleep } from './helpers';

const GAS_LIMIT_HARD_LIMIT = 2000000;

//////////////////////////////////////
async function sign(signer: Signer, txObject: TxData, chainId: number) {
    if (process.env.DEBUG) {
        Logger.log(`DEBUG mode - use debug signer`);
        return debugSign(txObject);
    }
    else {
        return await signer?.sign(txObject, chainId);
    }
}

async function isTXPending(web3: Web3, txHash: string): Promise<boolean> {
    const tx = await web3!.eth.getTransaction(txHash);
    if (tx == null || tx.blockNumber == null) {
        Logger.log(`tx ${txHash} is still waiting for block.`);
        return true; // still pending
    }

    const receipt = await web3!.eth.getTransactionReceipt(txHash);
    if (receipt == null) {
        Logger.log(`tx ${txHash} does not have receipt yet.`);
        return true; // still pending
    }

    Logger.log(`available receipt for tx ${txHash}`);//: ${JSON.stringify(receipt)}`);
    return false;

}
//////////////////////////////////////
async function waitForTX(web3: Web3, txHash: string, secLimit: number): Promise<Boolean> {
    let seconds: number = 0;
    let pending: Boolean = true;
    while (pending = await isTXPending(web3, txHash) && seconds < secLimit) {
        await sleep(5 * 1000);
        seconds += 5;
        Logger.log(`txHash is still pending, waiting ${seconds} seconds`)
    }
    return !pending;
}
//////////////////////////////////////
export async function completeTX(
    retry: number,
    web3: Web3,
    signer: Signer | undefined,
    encodedAbi: string,
    contractAddress: string,
    senderAddress: string,
    info: any): Promise<string> {

    if (!web3) throw new Error('Cannot send tx until web3 client is initialized.');
    if (!signer) throw new Error('Cannot send tx until signer is initialized.');

    const chainId = await web3.eth.getChainId();

    let i = 0;
    let txHash: string = '';

    while (i < retry && !txHash) {
        i++;
        info.retry = i;
        await signAndSendTransaction(web3, signer, chainId, encodedAbi, contractAddress, senderAddress).then(async (_txHash: string) => {
            txHash = _txHash;
            // wait for 60 seconds
            await waitForTX(web3, txHash, 60);
        }).catch(async (err: Error) => {
            if (!info.errors) info.errors = [];
            info.errors.push(err.message);
            Logger.error('signAndSendTransaction exception: ' + err.message);
            Logger.log('retry in 10 seconds...');
            await sleep(10 * 1000);
        });
    }
    return txHash;
}
//////////////////////////////////////
async function signAndSendTransaction(
    //task: any,
    web3: Web3,
    signer: Signer,
    chainId: number,
    encodedAbi: string,
    contractAddress: string,
    senderAddress: string
): Promise<string> {

    // update before loop execution
    const gasPrice = await web3.eth.getGasPrice();

    let nonce = await web3.eth.getTransactionCount(senderAddress, 'latest'); // ignore pending pool
    Logger.log(`senderAddress: ${senderAddress} nonce: ${nonce}`);

    const txObject: TxData = {
        to: contractAddress,
        gasPrice: toNumber(gasPrice || '0') * 1.1,  // TODO: fixme only for testing
        gasLimit: GAS_LIMIT_HARD_LIMIT,
        data: encodedAbi,
        nonce: nonce,
    };

    Logger.log(`About to estimate gas for tx object: ${jsonStringifyComplexTypes(txObject)}.`);

    const { rawTransaction, transactionHash } = await sign(signer, txObject, chainId);
    if (!rawTransaction || !transactionHash) {
        throw new Error(`Could not sign tx object: ${jsonStringifyComplexTypes(txObject)}.`);
    }

    return new Promise<string>((resolve, reject) => {
        // normally this returns a promise that resolves on receipt, but we ignore this mechanism and have our own
        web3.eth
            .sendSignedTransaction(rawTransaction, (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(transactionHash);

                }
            })
            .catch(() => {
                // do nothing (ignore the web3 promise)
            });
    });
}