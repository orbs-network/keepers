import Web3 from "web3";
import { Contract } from 'web3-eth-contract';
import { AbiItem } from "web3-utils"
import { writeStatusToDisk } from './write/status';
import { jsonStringifyComplexTypes, toNumber } from './helpers';
import { TxData } from "@ethereumjs/tx";
import { readFileSync, readdirSync } from 'fs';
import Signer from 'orbs-signer-client';

import { readManagementStatus2, setLeaderStatus } from './leader'

import * as tasksObj from './tasks.json';
import * as Logger from './logger';
// import { biSend } from "./bi";
import { Configuration } from "./config";
import { config } from "yargs";


const GAS_LIMIT_HARD_LIMIT = 2000000;
const MAX_LAST_TX = 10;

const abiFolder = process.cwd() + '/abi/';

//////////////////////////////////////
export class Keeper {
    private abis: { [key: string]: AbiItem[] };
    private contracts: { [key: string]: Contract };
    private status: any;
    private gasPrice: string | undefined;
    private validEthAddress: string;
    web3: Web3 | undefined;
    chainId: number | undefined;
    signer: Signer | undefined;

    //////////////////////////////////////
    constructor() {
        this.abis = {};
        this.contracts = {};
        this.gasPrice = '';
        this.validEthAddress = '';
        this.status = {
            start: Date.now(),
            successTX: [],
            failedTX: [],
            config: config,
            periodicUpdates: 0,
            lastUpdate: '',
            leaderIndex: -1,
            leaderName: '',
            balance: {
                "BNB": 0
            }
        };

        // load all ABIs
        Logger.log(`loading abis at ${abiFolder}`);
        // let files = ['./abi/revault-pool.json', './abi/revault-tvl.json'];
        // TODO: change just for dbg

        // let abi = JSON.parse(REVAULT_POOL_ABI);
        // this.abis['REVAULT_POOL_ABI'] = REVAULT_POOL_ABI;

        readdirSync(abiFolder).forEach(file => {
            Logger.log(`loading ABI file: ${file}`);
            let abi = JSON.parse(readFileSync(abiFolder + file, 'utf8'));
            if (abi) {
                var name = file.substring(0, file.lastIndexOf('.')) || file;
                this.abis[name] = abi;
            }
        });
    }

    getUptime(): string {
        // get total seconds between the times
        var delta = Math.abs(Date.now() - this.status.start) / 1000;

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
    getStatus(): any {
        // keept last 5 tx
        if (this.status.successTX.length > MAX_LAST_TX) {
            this.status.successTX.length.shift();
        }
        if (this.status.failTX.length > MAX_LAST_TX) {
            this.status.successTX.length.shift();
        }
        this.status.uptime = this.getUptime();
        return this.status;
    }

    //////////////////////////////////////
    async periodicUpdate(config: Configuration) {
        this.status.periodicUpdates += 1;
        const now = new Date();
        this.status.lastUpdateUTC = now.toUTCString();

        // has to be set- used in [findEthFromOrbsAddress]
        const management =
            await readManagementStatus2(config.ManagementServiceEndpoint, config.NodeOrbsAddress, this.status);

        // sets leader index and name
        // has to be after [readManagement]
        setLeaderStatus(management.Payload.CurrentCommittee, this.status);
        this.status.isLeader = this.status.myNode.Name === this.status.leaderName;

        // balance
        this.validEthAddress = `0x${this.status.myEthAddress}`;
        this.status.balance.BNB = await this.web3?.eth.getBalance(this.validEthAddress);


        writeStatusToDisk(config.StatusJsonPath, this.status);

        for (const t of tasksObj.tasks) {
            // first call - after that, task sets the next execution
            await this.exec(t);
        }
    }

    //////////////////////////////////////
    async signAndSendTransaction(
        encodedAbi: string,
        contractAddress: string,
        senderAddress: string
    ): Promise<string> {
        const web3 = this.web3;
        if (!web3) throw new Error('Cannot send tx until web3 client is initialized.');
        if (!this.signer) throw new Error('Cannot send tx until signer is initialized.');

        const nonce = await web3.eth.getTransactionCount(senderAddress, 'latest'); // ignore pending pool

        const txObject: TxData = {
            //chainId: 56, // BSC
            //from: senderAddress,
            to: contractAddress,
            gasPrice: toNumber(this.gasPrice || '0'),  // TODO: fixme only for testing
            gasLimit: GAS_LIMIT_HARD_LIMIT,
            data: encodedAbi,
            nonce: nonce,
        };

        Logger.log(`About to estimate gas for tx object: ${jsonStringifyComplexTypes(txObject)}.`);

        const { rawTransaction, transactionHash } = await this.signer.sign(txObject, this.chainId);
        // setAccount(web3);

        // const { rawTransaction, transactionHash } = debugSign(txObject);
        //const { rawTransaction, transactionHash } = await debugSignAccount(txObject);

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
    async sendNetworkContract(network: string, contract: Contract, method: string, params: any) {
        const now = new Date();
        const dt = now.toISOString();

        const tx = `${dt} ${network} ${contract.options.address} ${method} ${params}`;
        let bi: any = {
            type: 'sendTX',
            network: network,
            address: contract.options.address,
            method: method,
            params: params,
            sender: this.validEthAddress,
            nodeName: this.status.myNode.Name,
            success: true
        }


        // encode call
        let encoded: any;
        if (params) {
            encoded = contract.methods[method](params).encodeABI();
        } else {
            encoded = contract.methods[method]().encodeABI();
        }

        await this.signAndSendTransaction(encoded, contract.options.address, this.validEthAddress).then(async (txhash) => {
            this.status.successTX.push(tx);
            bi.txhash = txhash;
            // await biSend(config.BIUrl, bi);
            Logger.log('SUCCESS:' + tx);

        }).catch(async (err: Error) => {
            this.status.failedTX.push(tx);
            bi.success = false;
            bi.error = err.message;
            // await biSend(config.BIUrl, bi);
            Logger.error('signAndSendTransaction exception: ' + err.message);
            Logger.log('FAIL:' + tx);
        });
    }
    //////////////////////////////////////
    async execNetworkAddress(task: any, network: string, adrs: string) {
        // resolve abi
        const abi = task.abi;
        if (!abi) {
            return console.error(`abi ${task.name} does not exist in folder`);
        }

        // resolve contract
        if (!(adrs in this.contracts)) {
            this.contracts[adrs] = new Contract(abi, adrs)
        }
        const contract = this.contracts[adrs];

        for (let send of task.send) {
            // has params
            if (send.params) {
                for (let params of send.params) {
                    await this.sendNetworkContract(network, contract, send.method, params);
                }
            } // no params
            else {
                await this.sendNetworkContract(network, contract, send.method, null);
            }
        }
    }
    //////////////////////////////////////
    async execNetwork(task: any, network: string) {
        for (let adrs of task.addresses) {
            await this.execNetworkAddress(task, network, adrs);
        }
    }
    //////////////////////////////////////
    async exec(task: any) {

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
        //     nodeName: this.status.myNode.Name,
        // }
        // await biSend(config.BIUrl, bi);

        try {
            // update before loop execution
            this.gasPrice = await this.web3?.eth.getGasPrice();

            for (let network of task.networks) {
                await this.execNetwork(task, network);
            }
        } catch (e) {
            Logger.log(`Exception thrown from task: ${task.name}`);
            Logger.error(e);
        }
    }
}

////////////////////////////////////////////////
