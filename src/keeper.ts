import Web3 from "web3";
import { AbiItem } from "web3-utils"
import * as Logger from './logger';
import { biSend } from "./bi";
import { Configuration } from "./config";
import { readFileSync, readdirSync } from 'fs';
import { completeTX } from './tx'
import { Pacer } from "./pacer";
import Signer from 'orbs-signer-client';
import _ from 'lodash';
import { readManagementStatus2 } from './leader'
import * as tasksObj from './tasks.json';
import { getCurrentClockTime } from './helpers';

//////////////////////////////////////
// consts
const MAX_LAST_TX = 10;
const TASK_TIME_DIVISION_MIN = 167; // prime number to reduce task miss and span guardians more equally
//const TASK_TIME_DIVISION_MIN = 13; // prime number to reduce task miss and span guardians more equally
const abiFolder = process.cwd() + '/abi/';
const alwaysLeader = (process.env.DEBUG === '1' || process.env.ALWAYS_LEADER === '1');

//////////////////////////////////////
export class Keeper {
    public abis: { [key: string]: AbiItem[] };
    public contracts: { [key: string]: any };
    public status: any;
    public management: any;
    public web3: Web3 | undefined;
    public pacer: Pacer;
    chainId: number | undefined;
    signer: Signer | undefined;
    //nextTaskRun: { [taskName: string]: number };
    guardianAddress: string = '0x';
    senderOrbsAddress: string = '0x';


    //////////////////////////////////////
    constructor() {
        this.abis = {};
        this.contracts = {};
        this.pacer = new Pacer();
        this.status = {
            ServiceLaunchTime: Date.now(),
            epochIndex: -1,
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
        //this.nextTaskRun = {};
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

        Logger.log('tasks---------------');
        Logger.log(JSON.stringify(tasksObj, null, 2));
    }

    //////////////////////////////////////
    getHumanUptime(): string {
        // get total seconds between the times
        var delta = Math.abs(Date.now() - this.status.ServiceLaunchTime) / 1000;

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
    async getBalance() {
        const senderAddress = `0x${this.status.config.NodeOrbsAddress}`;
        if (!this.web3) throw new Error('web3 client is not initialized.');

        this.status.balance.BNB = await this.web3.eth.getBalance(senderAddress);
    }
    //////////////////////////////////////
    setStatus(): any {
        // keept last 5 tx
        if (this.status.successTX.length > MAX_LAST_TX) {
            this.status.successTX.shift();
        }
        if (this.status.failTX.length > MAX_LAST_TX) {
            this.status.failTX.shift();
        }
        this.status.humanUptime = this.getHumanUptime(); //human uptime
        const now = new Date();
        this.status.lastUpdateUTC = now.toUTCString();

        // epoch
        // move to onTick - this.status.epochIndex = this.pacer.getEpochIndex();
    }

    //////////////////////////////////////
    setGuardianEthAddr(config: Configuration) {
        // save config in status
        this.status.config = config;

        // use con fig fields
        this.senderOrbsAddress = `0x${config.NodeOrbsAddress}`;
        if (!this.signer) {
            // only once
            Logger.log(`signer init with  ${this.status.config.SignerEndpoint}`);
            this.signer = new Signer(this.status.config.SignerEndpoint);
        }

        try {
            const curAddress = this.guardianAddress;
            this.guardianAddress = _.map(_.filter(this.management.Payload.CurrentTopology, (data) => data.OrbsAddress === config.NodeOrbsAddress), 'EthAddress')[0];
            if (curAddress !== this.guardianAddress)
                Logger.log(`guardian address was set to ${this.guardianAddress}`);

        } catch (err) {
            Logger.log(`failed to find Guardian's address for node ${config.NodeOrbsAddress}`);
            return;
        }
    }

    //////////////////////////////////////////////////////////////////
    setLeader() {
        const committee = this.management.Payload.CurrentCommittee;
        const leaderIndex = this.currentLeaderIndex(committee);

        // same leader dont change
        if (leaderIndex === this.status.leaderIndex)
            return this.status.isLeader;

        // replace leader
        const leader = committee[leaderIndex];
        this.status.leaderIndex = leaderIndex;
        this.status.leaderName = leader.Name;
        this.status.leaderEthAddress = leader.EthAddress;

        Logger.log(`leader changed: ${leader.Name} ${leader.EthAddress}`);

        // M I the leader?
        this.status.isLeader = leader.EthAddress === this.guardianAddress;

        // send bi
        let bi: any = {
            type: 'leaderChanged',
            nodeName: this.status.myNode.Name,
            leaderIndex: leaderIndex,
            leaderName: leader.Name,
            leaderEthAddress: leader.EthAddress
        }
        // bi leader changed
        biSend(this.status.config.BIUrl, bi);
        return this.status.isLeader;
    }

    //////////////////////////////////////////////////////////////////
    currentLeaderIndex(committee: Array<any>): any {
        //return Math.floor(Date.now() / (TASK_TIME_DIVISION_MIN * 60000)) % committee.length;
        return Math.floor(this.pacer.getEpochIndex() / TASK_TIME_DIVISION_MIN) % committee.length;
    }
    //////////////////////////////////////////////////////////////////
    isTimeToRun(task: any) {
        return this.status.epochIndex % task.intervalMinutes === 0;
    }
    //////////////////////////////////////
    //async function sendContract(state: Keeper, task: any, senderAddress: string) {
    async sendNetworkContract(network: string, contract: any, method: string, params: any) {

        if (!this.web3) throw new Error('web3 client is not initialized.');

        const now = new Date();
        const dt = now.toISOString();
        const tx = `${dt} ${network} ${contract.options.address} ${method} ${params}`;

        let bi: any = {
            type: 'sendTX',
            nodeName: this.status.myNode.Name,
            network: network,
            sender: this.senderOrbsAddress,
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

        if (process.env.NODE_ENV !== 'production') {
            Logger.log(`NOT PRODUCTION - avoid sending ${tx}`);
            return;
        }

        const retry = 5;
        let info = { retry: 0, errors: null };
        let completedTxHash = await completeTX(retry, this.web3, this.signer, encoded, contract.options.address, this.senderOrbsAddress, info);
        // how many attempts
        bi.retry = info.retry;

        if (completedTxHash) {
            this.status.successTX.push(tx);
            bi.txhash = completedTxHash;

            await biSend(this.status.config.BIUrl, bi);
            Logger.log('SUCCESS:' + tx);

        } else {
            this.status.failTX.push(tx);
            if (info.errors)
                bi.errors = info.errors;

            bi.success = false;
            await biSend(this.status.config.BIUrl, bi);
            throw new Error('signAndSendTransaction didnt complete: ' + tx);
        };
    }
    //////////////////////////////////////
    async execNetworkAdress(task: any, network: string, adrs: string) {
        // resolve abi
        const abi = this.abis[task.abi];
        if (!abi) {
            throw new Error(`abi ${task.abi} does not exist in folder`);
        }

        // resolev contract
        if (!(adrs in this.contracts)) {
            this.contracts[adrs] = new this.web3!.eth.Contract(abi, adrs, {
                from: this.senderOrbsAddress // default from address
                //gasPrice: this.gasPrice // default gas price in wei, 20 gwei in this case
            });

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
            await this.execNetworkAdress(task, network, adrs);
        }
    }
    //////////////////////////////////////
    async execTask(task: any, errors: Array<string>) {
        Logger.log(`${task.name} execute task`);
        if (!task.active) {
            Logger.log(`task ${task.name} inactive`);
            return;
        }

        // send bi
        let bi: any = {
            type: 'execTask',
            name: task.name,
            nodeName: this.status.myNode.Name,
            network: task.networks[0],
            intervalMinutes: task.intervalMinutes,
        }
        await biSend(this.status.config.BIUrl, bi);

        try {
            //await sendContract(state, task, senderAddress);
            for (let network of task.networks) {
                await this.execNetwork(task, network);
            }

        } catch (e) {
            const errText = `$task:{task.name} Exception: ${e}\n`;
            errors.push(errText);
            Logger.error(errText);
        }
        // next exec
        var coeff = 1000 * 60 * 1;
        let dt = new Date(Date.now() + task.intervalMinutes * 60 * 1000);
        const rounded = new Date(Math.round(dt.getTime() / coeff) * coeff)
        Logger.log(`${task.name} NEXT execution in ${task.intervalMinutes} epochs, after ${rounded.toISOString()}`);
    }
    //////////////////////////////////////
    // tick should be more often then epoch index progress
    // if epoch change - go forward
    async onTick() {
        this.status.tickCount += 1;
        let curIndx = this.pacer.getEpochIndex()
        // epoch hasnt change- DO NOTHING
        if (this.status.epochIndex === curIndx) return;

        this.status.epochIndex = curIndx;

        try {
            // update management
            await readManagementStatus2(this.status.config.ManagementServiceEndpoint, this.status.config.NodeOrbsAddress, this);
            // update management and config
            this.setGuardianEthAddr(this.status.config);
        } catch (e) {
            Logger.error(`readManagementStatus2 error: ${e} continue with last call values`);
            //register stale error if pollTime is > 10min
            const deltaMinutes = Math.round((getCurrentClockTime() - this.status.ManagementLastPollTime) / 60)
            if (deltaMinutes > 10)
                this.status.error = `management data is stale over $}\n`;
        }
        if (this.management?.Payload?.CurrentCommittee?.length <= 0) {
            console.error('commitee is not fetched yet');
            return;
        }


        // leader  
        const isLeader = this.setLeader() || alwaysLeader;
        let taskExecuted: boolean = false;

        if (!this.web3) {
            this.status.error = 'web3 client is not initialized.';
            Logger.error(this.status.error);
            return;
        }

        let errors: Array<string> = [];

        // tasks execution
        for (const t of tasksObj.tasks) {
            if (this.isTimeToRun(t) && isLeader) {
                // first call - after that, task sets the next execution      
                await this.execTask(t, errors);
                taskExecuted = true;
            }
        }
        if (taskExecuted) {
            // balance
            await this.getBalance(); /// update balance after tx send
            // clear errors
            this.status.error = "";
            // add exceptions if thrown
            for (let e of errors) {
                this.status.error += e + '\n';
            }
        }
    }
}
