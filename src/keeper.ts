import Web3 from "web3";
// import { Contract } from 'web3-eth-contract';
import { State } from './model/state';

// import { writeStatusToDisk } from './write/status';
import { jsonStringifyComplexTypes, toNumber } from './helpers';
import { TxData } from "@ethereumjs/tx";

import Signer from 'orbs-signer-client';
import * as Logger from './logger';
// import { biSend } from "./bi";
// import {EthereumcanSendTx} from "./model/state";
import _ from 'lodash';

const GAS_LIMIT_HARD_LIMIT = 2000000;
const MAX_LAST_TX = 10;
const EPOCH_DURATION_MINUTES = 13; //167; // prime number to reduce task miss and span guardians more equally

//////////////////////////////////////
export class Keeper {
    // private abis: { [key: string]: AbiItem[] };
    // private contracts: { [key: string]: Contract};
    public status: any;
    public validEthAddress: string;
    public management: any;
    public gasPrice: string | undefined;

    web3: Web3 | undefined;
    chainId: number | undefined;
    signer: Signer | undefined;
    pendingTx: { txHash: string | null, taskName: string | null, taskInterval: number | null };
    nextTaskRun: { [taskName: string]: number };
    guardianAddress: string = '0x';

    //////////////////////////////////////
    constructor() {
        // this.abis = {};
        // this.contracts = {};
        this.gasPrice = '';
        this.validEthAddress = '';
        this.status = {
            start: Date.now(),
            isLeader: Boolean,
            successTX: [],
            //failedTX: [],
            periodicUpdates: 0,
            lastUpdate: '',
            leaderIndex: -1,
            leaderName: '',
            balance: {
                "BNB": 0
            }
        };

        this.nextTaskRun = {};
        this.pendingTx = { txHash: null, taskName: null, taskInterval: null };
        // load all ABIs
        // Logger.log(`loading abis at ${abiFolder}`);
        // let files = ['./abi/revault-pool.json', './abi/revault-tvl.json'];
        // TODO: change just for dbg

        // let abi = JSON.parse(REVAULT_POOL_ABI);
        // this.abis['REVAULT_POOL_ABI'] = REVAULT_POOL_ABI;

        // readdirSync(abiFolder).forEach(file => {
        //     Logger.log(`loading ABI file: ${file}`);
        //     let abi = JSON.parse(readFileSync(abiFolder + file, 'utf8'));
        //     if (abi) {
        //         var name = file.substring(0, file.lastIndexOf('.')) || file;
        //         this.abis[name] = abi;
        //     }
        // });
    }
}
//////////////////////////////////////
function getUptime(state: State): string {
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
export function setStatus(state: State): any {
    // keept last 5 tx
    if (state.status?.successTX.length > MAX_LAST_TX) {
        state.status.successTX.length.shift();
    }
    if (state.status?.failTX.length > MAX_LAST_TX) {
        state.status.successTX.length.shift();
    }
    state.status.uptime = getUptime(state);
}

//////////////////////////////////////////////////////////////////
export function setLeader(state: State) {
    state.status.isLeader = isLeader(state.ManagementCurrentCommittee, state.MyGuardianAddress);
    if (!state.status.isLeader) {
        Logger.log(`Node was not selected as a leader`);
        const currLeader = currentLeader(state.management.Payload.CurrentCommittee).EthAddress;
        Logger.log(`Current leader eth address: ${currLeader}`);

        state.nextTaskRun = {};
        return;
    }
}

function currentLeader(committee: Array<any>): any { // currentLeader
    return committee[Math.floor(Date.now() / (EPOCH_DURATION_MINUTES * 60000)) % committee.length];
}

//////////////////////////////////////////////////////////////////
export function isLeader(committee: Array<any>, address: string): boolean {
    const currentLeaderInfo = currentLeader(committee);
    Logger.log(`currentLeaderInfo: ${JSON.stringify(currentLeaderInfo)}`);
    return currentLeaderInfo.EthAddress === address;
}

//////////////////////////////////////////////////////////////////
function scheduleNextRun(state: State, taskName: string, taskInterval: number) {
    state.nextTaskRun[taskName] = taskInterval * Math.floor(Date.now() / taskInterval) + taskInterval;
    Logger.log(`scheduled next run for task ${taskName} to ${JSON.stringify(state.nextTaskRun[taskName])}`);
}

//////////////////////////////////////////////////////////////////
export function shouldSendTx(state: State, taskName: string, taskInterval: number) {

    if (!(taskName in state.nextTaskRun)) {
        Logger.log(`task ${taskName} has no entry in nextTaskRun ${JSON.stringify(state.nextTaskRun)}`);
        scheduleNextRun(state, taskName, taskInterval);
        return false;
    }

    // TODO: add support: check if leader th is near and send tx

    if (Date.now() >= state.nextTaskRun[taskName]) {
        Logger.log(`next slot run hit for ${taskName}`);
        return true;
    }

    return false;
}

//////////////////////////////////////////////////////////////////
export async function canSendTx(state: State) {
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

    if (state.pendingTx.taskInterval === null)
        throw Error(`missing task interval for ${state.pendingTx.taskInterval}`);

    scheduleNextRun(state, state.pendingTx.taskName, state.pendingTx.taskInterval);

    state.pendingTx.txHash = null;
    state.pendingTx.taskName = null;
    state.pendingTx.taskInterval = null;

    return true;
}

//////////////////////////////////////
async function signAndSendTransaction(
    state: State,
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

    const { rawTransaction, transactionHash } = await state.signer.sign(txObject, state.chainId);

    // DEBUG
    // setAccount(web3);
    // const { rawTransaction, transactionHash } = debugSign(txObject);
    //const { rawTransaction, transactionHash } = await debugSignAccount(txObject);

    if (!rawTransaction || !transactionHash) {
        throw new Error(`Could not sign tx object: ${jsonStringifyComplexTypes(txObject)}.`);
    }

    state.pendingTx.txHash = transactionHash;
    state.pendingTx.taskName = task.name;
    state.pendingTx.taskInterval = task.taskInterval * 60000;

    Logger.log(`taskName ${state.pendingTx.taskName}, taskInterval ${state.pendingTx.taskInterval}, txHash ${state.pendingTx.txHash} was added to pendingTx`);

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
async function sendContract(state: State, task: any, senderAddress: string) {
    const network = task.network;
    const method = task.method;
    const params = task.params;
    const abi = task.abi;
    const addr = task.address

    if (!abi) {
        return console.error(`abi ${task.name} does not exist in folder`);
    }

    if (!state.web3) throw new Error('web3 client is not initialized.');

    const now = new Date();
    const dt = now.toISOString();
    let contract = new state.web3.eth.Contract(abi, addr);

    const tx = `${dt} ${network} ${contract.options.address} ${method} ${params}`;
    let bi: any = {
        type: 'sendTX',
        network: network,
        address: contract.options.address,
        method: method,
        params: params,
        sender: state.validEthAddress,
        // nodeName: state.status.myNode.Name,
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
        if (state.status) state.status.successTX.push(tx);
        bi.txhash = txhash;
        // await biSend(config.BIUrl, bi);
        Logger.log('SUCCESS:' + tx);

    }).catch(async (err: Error) => {
        bi.success = false;
        bi.error = err.message;
        // await biSend(config.BIUrl, bi);
        Logger.error('signAndSendTransaction exception: ' + err.message);
        Logger.log('FAIL:' + tx);
        //state!.status!.failedTX.push(tx);
    });
}

//////////////////////////////////////
export async function execTask(state: State, task: any, senderAddress: string) {

    Logger.log(`execute task: ${task.name}`);
    if (!task.active) {
        Logger.log(`task ${task.name} inactive`);
        return;
    }

    // send bi
    // let bi: any = {
    //     type: 'execTask',
    //     network: task.name,
    //     minInterval: task.minInterval,
    //     nodeName: state.status.myNode.Name,
    // }
    // await biSend(config.BIUrl, bi);

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
