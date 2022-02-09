import Web3 from "web3";
// import { Contract } from 'web3-eth-contract';

// import { writeStatusToDisk } from './write/status';
import { jsonStringifyComplexTypes, toNumber } from './helpers';
import { TxData } from "@ethereumjs/tx";
import { AbiItem } from "web3-utils"

import Signer from 'orbs-signer-client';
import * as Logger from './logger';
import { biSend } from "./bi";
import { Configuration } from "./config";
import { readFileSync, readdirSync } from 'fs';
import { debugSign } from "./debugSigner";
// import {EthereumcanSendTx} from "./model/state";
import _ from 'lodash';

const GAS_LIMIT_HARD_LIMIT = 2000000;
const MAX_LAST_TX = 10;
const TASK_TIME_DIVISION_MIN = 167; // prime number to reduce task miss and span guardians more equally

const abiFolder = process.cwd() + '/abi/';
//////////////////////////////////////
export class Keeper {
    public abis: { [key: string]: AbiItem[] };
    // private contracts: { [key: string]: Contract};
    public status: any;
    public management: any;
    public gasPrice: string | undefined;

    web3: Web3 | undefined;
    chainId: number | undefined;
    signer: Signer | undefined;
    pendingTx: { txHash: string | null, taskName: string | null, minInterval: number | null };
    nextTaskRun: { [taskName: string]: number };
    guardianAddress: string = '0x';

    //////////////////////////////////////
    constructor() {
        this.abis = {};
        // this.contracts = {};
        this.gasPrice = '';
        this.status = {
            start: Date.now(),
            isLeader: Boolean,
            successTX: [],
            failedTX: [],
            periodicUpdates: 0,
            lastUpdate: '',
            leaderIndex: -1,
            leaderName: '',
            balance: {
                "BNB": 0
            }
        };

        this.nextTaskRun = {};
        this.pendingTx = { txHash: null, taskName: null, minInterval: null };
        // load all ABIs
        Logger.log(`loading abis at ${abiFolder}`);

        readdirSync(abiFolder).forEach(file => {
            Logger.log(`loading ABI file: ${file}`);
            let abi = JSON.parse(readFileSync(abiFolder + file, 'utf8'));
            if (abi) {
                var name = file.substring(0, file.lastIndexOf('.')) || file;
                this.abis[name] = abi;
            }
        });
    }
}
//////////////////////////////////////
function getUptime(state: Keeper): string {
    // get total seconds between the times
    var delta = Math.abs(Date.now() - state.status.start) / 1000;

    // calculate (and subtract) whole days
    var days = Math.floor(delta / 86400);
    delta -= days * 86400;

    // calculate (and subtract) whole hours
    var hours = Math.floor(delta / 3600) % 24;
    delta -= hours * 3600;

    // calculate (and subtract) whole minutes
    var minutes = Math.floor(delta / 60) % 60;
    delta -= minutes * 60;

    // what's left is seconds
    var seconds = delta % 60;  // in theory the modulus is not required

    return `${days} days : ${hours}:${minutes}:${seconds}`;
}
//////////////////////////////////////
export async function getBalance(state: Keeper) {
    const senderAddress = `0x${state.status.config.NodeOrbsAddress}`;
    if (!state.web3) throw new Error('web3 client is not initialized.');

    state.status.balance.BNB = await state.web3.eth.getBalance(senderAddress);
}
//////////////////////////////////////
export function setStatus(state: Keeper): any {
    // keept last 5 tx
    if (state.status.successTX.length > MAX_LAST_TX) {
        state.status.successTX.length.shift();
    }
    if (state.status.failTX.length > MAX_LAST_TX) {
        state.status.successTX.length.shift();
    }
    state.status.uptime = getUptime(state);
}

//////////////////////////////////////
export async function setGuardianEthAddr(state: Keeper, config: Configuration) {
    // save config in status
    state.status.config = config;

    try {
        state.guardianAddress = _.map(_.filter(state.management.Payload.CurrentTopology, (data) => data.OrbsAddress === config.NodeOrbsAddress), 'EthAddress')[0];
        Logger.log(`guardian address was set to ${state.guardianAddress}`);

    } catch (err) {
        Logger.log(`failed to find Guardian's address for node ${config.NodeOrbsAddress}`);
        return;
    }
}

//////////////////////////////////////////////////////////////////
export function isLeader(state: Keeper) {
    if (process.env.DEBUG) {
        Logger.log(`DEBUG mode - Always selected as leader`);
        return true;
    }
    const committee = state.management.Payload.CurrentCommittee;
    state.status.isLeader = currentLeader(committee).EthAddress === state.guardianAddress;

    if (!state.status.isLeader) {
        Logger.log(`Node was not selected as a leader`);
        const currLeader = currentLeader(state.management.Payload.CurrentCommittee).EthAddress;
        Logger.log(`Current leader eth address: ${currLeader}`);

        state.nextTaskRun = {};
    }
    return state.status.isLeader;
}

//////////////////////////////////////////////////////////////////
function currentLeader(committee: Array<any>): any {
    return committee[Math.floor(Date.now() / (TASK_TIME_DIVISION_MIN * 60000)) % committee.length];
}

//////////////////////////////////////////////////////////////////
function scheduleNextRun(state: Keeper, taskName: string, minInterval: number) {
    const msInterval = minInterval * 60 * 1000;
    state.nextTaskRun[taskName] = msInterval * Math.floor(Date.now() / msInterval) + msInterval;
    const dt = new Date(state.nextTaskRun[taskName]);
    Logger.log(`scheduled next run for task ${taskName} to ${dt.toISOString()}`);
}

//////////////////////////////////////////////////////////////////
export function shouldExecTask(state: Keeper, task: any) {

    if (!(task.name in state.nextTaskRun)) {
        Logger.log(`task ${task.name} has no entry in nextTaskRun ${JSON.stringify(state.nextTaskRun)}`);
        scheduleNextRun(state, task.name, task.minInterval);
        return false;
    }

    // TODO: add support: check if leader th is near and send tx

    if (Date.now() >= state.nextTaskRun[task.name]) {
        Logger.log(`next slot run hit for ${task.name}`);
        return true;
    }

    return false;
}

//////////////////////////////////////////////////////////////////
export async function canSendTx(state: Keeper) {
    if (!state.web3) throw new Error('Cannot send tx until web3 client is initialized.');
    if (!state.pendingTx.txHash) return true;

    console.log(`checking txHash: ${state.pendingTx.txHash}`);
    const tx = await state.web3.eth.getTransaction(state.pendingTx.txHash);
    if (tx == null || tx.blockNumber == null) {
        Logger.log(`tx ${state.pendingTx.txHash} is still waiting for block.`);
        return false; // still pending
    }

    const receipt = await state.web3.eth.getTransactionReceipt(state.pendingTx.txHash);
    if (receipt == null) {
        Logger.log(`tx ${state.pendingTx.txHash} does not have receipt yet.`);
        return false; // still pending
    }

    Logger.log(`available receipt for tx ${state.pendingTx.txHash}: ${JSON.stringify(receipt)}`);

    if (state.pendingTx.taskName === null)
        throw Error(`missing task name for ${state.pendingTx.txHash}`);

    if (!state.pendingTx.minInterval)
        throw Error(`missing task interval for ${state.pendingTx.minInterval}`);

    scheduleNextRun(state, state.pendingTx.taskName, state.pendingTx.minInterval);

    state.pendingTx.txHash = null;
    state.pendingTx.taskName = null;
    state.pendingTx.minInterval = null;

    return true;
}

//////////////////////////////////////
async function sign(state: Keeper, txObject: TxData) {
    if (process.env.DEBUG) {
        Logger.log(`DEBUG mode - use debug signer`);
        return debugSign(txObject);
    }
    else {
        return await state.signer?.sign(txObject, state.chainId);
    }
}
//////////////////////////////////////
async function signAndSendTransaction(
    state: Keeper,
    task: any,
    encodedAbi: string,
    contractAddress: string,
    senderAddress: string,
): Promise<string> {
    const web3 = state.web3;
    if (!web3) throw new Error('Cannot send tx until web3 client is initialized.');
    if (!state.signer) throw new Error('Cannot send tx until signer is initialized.');

    let nonce = await web3.eth.getTransactionCount(senderAddress, 'latest'); // ignore pending pool
    Logger.log(`senderAddress: ${senderAddress} nonce: ${nonce}`);

    const txObject: TxData = {
        to: contractAddress,
        gasPrice: toNumber(state.gasPrice || '0') * 1.1,  // TODO: fixme only for testing
        gasLimit: GAS_LIMIT_HARD_LIMIT,
        data: encodedAbi,
        nonce: nonce,
    };

    Logger.log(`About to estimate gas for tx object: ${jsonStringifyComplexTypes(txObject)}.`);

    const { rawTransaction, transactionHash } = await sign(state, txObject);

    if (!rawTransaction || !transactionHash) {
        throw new Error(`Could not sign tx object: ${jsonStringifyComplexTypes(txObject)}.`);
    }

    state.pendingTx.txHash = transactionHash;
    state.pendingTx.taskName = task.name;
    state.pendingTx.minInterval = task.minInterval;

    Logger.log(`taskName ${state.pendingTx.taskName}, minInterval ${state.pendingTx.minInterval}, txHash ${state.pendingTx.txHash} was added to pendingTx`);

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

//////////////////////////////////////
async function sendContract(state: Keeper, task: any, senderAddress: string) {
    // TODO: resume dynamic exec
    const network = task.networks[0];
    const method = task.send[0].method;
    const params = task.send[0].params ? task.send[0].params[0] : null;
    //const abi = task.abi; AMIs
    const addr = task.addresses[0];
    const abi = state.abis[task.abi];
    if (!abi) {
        throw new Error(`abi ${task.name} does not exist in folder`);
    }

    if (!state.web3) throw new Error('web3 client is not initialized.');

    const now = new Date();
    const dt = now.toISOString();
    let contract = new state.web3.eth.Contract(abi, addr);
    const tx = `${dt} ${network} ${contract.options.address} ${method} ${params}`;

    let bi: any = {
        type: 'sendTX',
        nodeName: state.status.myNode.Name,
        network: network,
        sender: senderAddress,
        contract: contract.options.address,
        method: method,
        params: params,
        success: true
    }

    // encode call
    let encoded: any;
    if (params) {
        encoded = contract.methods[method](params).encodeABI();
    } else {
        encoded = contract.methods[method]().encodeABI();
    }

    await signAndSendTransaction(state, task, encoded, contract.options.address, senderAddress).then(async (txhash) => {
        state.status.successTX.push(tx);
        bi.txhash = txhash;
        await biSend(state.status.config.BIUrl, bi);
        Logger.log('SUCCESS:' + tx);

    }).catch(async (err: Error) => {
        state.status.failedTX.push(tx);
        bi.success = false;
        bi.error = err.message;
        await biSend(state.status.config.BIUrl, bi);
        Logger.error('signAndSendTransaction exception: ' + err.message);
        Logger.log('FAIL:' + tx);
    });
}

//////////////////////////////////////
export async function execTask(state: Keeper, task: any) {
    const senderAddress = `0x${state.status.config.NodeOrbsAddress}`;
    Logger.log(`execute task: ${task.name}`);
    if (!task.active) {
        Logger.log(`task ${task.name} inactive`);
        return;
    }

    // send bi
    let bi: any = {
        type: 'execTask',
        name: task.name,
        network: task.networks[0],
        minInterval: task.minInterval,
        nodeName: state.status.myNode.Name,
    }
    await biSend(state.status.config.BIUrl, bi);

    try {

        if (!state.web3) {
            Logger.error('web3 client is not initialized.');
            return;
        }

        // update before loop execution
        state.gasPrice = await state.web3.eth.getGasPrice();

        await sendContract(state, task, senderAddress);

    } catch (e) {
        Logger.log(`Exception thrown from task: ${task.name}`);
        Logger.error(e);
    }
}

// ////////////////////////////////////////////////
