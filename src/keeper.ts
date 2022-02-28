import Web3 from "web3";
import { jsonStringifyComplexTypes, toNumber } from './helpers';
import { TxData } from "@ethereumjs/tx";
import { AbiItem } from "web3-utils"
import Signer from 'orbs-signer-client';
import * as Logger from './logger';
import { biSend } from "./bi";
import { Configuration } from "./config";
import { readFileSync, readdirSync } from 'fs';
import { debugSign } from "./debugSigner";
import _ from 'lodash';

const GAS_LIMIT_HARD_LIMIT = 2000000;
const MAX_LAST_TX = 10;
const TASK_TIME_DIVISION_MIN = 167; // prime number to reduce task miss and span guardians more equally

const abiFolder = process.cwd() + '/abi/';
//////////////////////////////////////
export class Keeper {
    public abis: { [key: string]: AbiItem[] };
    public contracts: { [key: string]: any };
    public status: any;
    public management: any;
    public gasPrice: string | undefined;

    public web3: Web3 | undefined;
    chainId: number | undefined;
    signer: Signer | undefined;
    nextTaskRun: { [taskName: string]: number };
    guardianAddress: string = '0x';
    senderOrbsAddress: string = '0x';


    //////////////////////////////////////
    constructor() {
        this.abis = {};
        this.contracts = {};
        this.gasPrice = '';
        this.status = {
            start: Date.now(),
            tickCount: 0,
            isLeader: Boolean,
            leaderIndex: -1,
            leaderName: '',
            successTX: [],
            failTX: [],
            lastUpdate: '',
            balance: {
                "BNB": 0
            }
        };

        this.nextTaskRun = {};
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
        state.status.failTX.length.shift();
    }
    state.status.uptime = getUptime(state);
    const now = new Date();
    state.status.lastUpdateUTC = now.toUTCString();
}

//////////////////////////////////////
export async function setGuardianEthAddr(state: Keeper, config: Configuration) {
    // save config in status
    state.status.config = config;
    state.senderOrbsAddress = `0x${config.NodeOrbsAddress}`;

    try {
        const curAddress = state.guardianAddress;
        state.guardianAddress = _.map(_.filter(state.management.Payload.CurrentTopology, (data) => data.OrbsAddress === config.NodeOrbsAddress), 'EthAddress')[0];
        if (curAddress !== state.guardianAddress)
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
    const leaderIndex = currentLeaderIndex(committee);

    // same leader dont change
    if (leaderIndex === state.status.leaderIndex)
        return;

    // replace leader
    const leader = committee[leaderIndex];
    state.status.leaderIndex = leaderIndex;
    state.status.leaderName = leader.Name;
    state.status.leaderEthAddress = leader.EthAddress;

    Logger.log(`leader changed: ${leader.Name} ${leader.EthAddress}`);

    // M I the leader?
    state.status.isLeader = leader.EthAddress === state.guardianAddress;

    // send bi
    let bi: any = {
        type: 'leaderChanged',
        nodeName: state.status.myNode.Name,
        leaderIndex: leaderIndex,
        leaderName: leader.Name,
        leaderEthAddress: leader.EthAddress
    }
    biSend(state.status.config.BIUrl, bi);

    if (!state.status.isLeader) {
        state.nextTaskRun = {};
    }
    return state.status.isLeader;
}

//////////////////////////////////////////////////////////////////
function currentLeaderIndex(committee: Array<any>): any {
    return Math.floor(Date.now() / (TASK_TIME_DIVISION_MIN * 60000)) % committee.length;
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

async function isTXPending(web3: Web3 | undefined, txHash: string): Promise<boolean> {
    Logger.log(`checking txHash: ${txHash}`);
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

    Logger.log(`available receipt for tx ${txHash}: ${JSON.stringify(receipt)}`);
    return false;

}
//////////////////////////////////////////////////////////////////
export async function hasPendingTX(state: Keeper, task: any): Promise<boolean> {
    // creating pending tx set
    if (!task.pendingTX) {
        task.pendingTX = new Set<string>();
        return false;
    }
    let hasPending = false;
    let completed: Array<string> = [];
    task.pendingTX.forEach(async (txHash: string) => {
        if (await isTXPending(state.web3, txHash)) {
            hasPending = true;
        } else {
            completed.push(txHash);
        }
    });
    // remove completed
    for (let txHash in completed) {
        task.pendingTX.delete(txHash);
    }

    //cleanup completed
    return hasPending;
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
    //task: any,
    encodedAbi: string,
    contractAddress: string,
    //senderAddress: string,
): Promise<string> {
    const senderAddress = state.senderOrbsAddress;
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
//async function sendContract(state: Keeper, task: any, senderAddress: string) {
async function sendNetworkContract(state: Keeper, task: any, network: string, contract: any, method: string, params: any) {

    if (!state.web3) throw new Error('web3 client is not initialized.');

    const now = new Date();
    const dt = now.toISOString();
    //let contract = new state.web3.eth.Contract(abi, addr);
    const tx = `${dt} ${network} ${contract.options.address} ${method} ${params}`;

    let bi: any = {
        type: 'sendTX',
        nodeName: state.status.myNode.Name,
        network: network,
        sender: state.senderOrbsAddress,
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

    await signAndSendTransaction(state, encoded, contract.options.address).then(async (txhash) => {
        state.status.successTX.push(tx);
        task.pendingTX.add(txhash);
        bi.txhash = txhash;
        await biSend(state.status.config.BIUrl, bi);
        Logger.log('SUCCESS:' + tx);

    }).catch(async (err: Error) => {
        state.status.failTX.push(tx);
        bi.success = false;
        bi.error = err.message;
        await biSend(state.status.config.BIUrl, bi);
        Logger.error('signAndSendTransaction exception: ' + err.message);
        Logger.log('FAIL:' + tx);
    });
}

//////////////////////////////////////
async function execNetworkAdress(state: Keeper, task: any, network: string, adrs: string) {
    // resolve abi
    const abi = state.abis[task.abi];
    if (!abi) {
        return Logger.error(`abi ${task.abi} does not exist in folder`);
    }

    // resolev contract
    if (!(adrs in state.contracts)) {
        state.contracts[adrs] = new state!.web3!.eth.Contract(abi, adrs, {
            from: state.senderOrbsAddress, // default from address
            gasPrice: state.gasPrice // default gas price in wei, 20 gwei in this case
        });

    }
    const contract = state.contracts[adrs];
    for (let send of task.send) {
        // has params
        if (send.params) {
            for (let params of send.params) {
                await sendNetworkContract(state, task, network, contract, send.method, params);
            }
        } // no params
        else {
            await sendNetworkContract(state, task, network, contract, send.method, null);
        }
    }
}
//////////////////////////////////////
async function execNetwork(state: Keeper, task: any, network: string) {
    for (let adrs of task.addresses) {
        await execNetworkAdress(state, task, network, adrs);
    }
}
//////////////////////////////////////
export async function execTask(state: Keeper, task: any) {
    Logger.log(`execute task: ${task.name}`);
    if (!task.active) {
        Logger.log(`task ${task.name} inactive`);
        return;
    }

    // send bi
    let bi: any = {
        type: 'execTask',
        name: task.name,
        nodeName: state.status.myNode.Name,
        network: task.networks[0],
        minInterval: task.minInterval,
    }
    await biSend(state.status.config.BIUrl, bi);

    try {

        if (!state.web3) {
            Logger.error('web3 client is not initialized.');
            return;
        }

        // update before loop execution
        state.gasPrice = await state.web3.eth.getGasPrice();

        //await sendContract(state, task, senderAddress);
        for (let network of task.networks) {
            await execNetwork(state, task, network);
        }

    } catch (e) {
        Logger.log(`Exception thrown from task: ${task.name}`);
        Logger.error(e);
    }
}

// ////////////////////////////////////////////////
