import * as Logger from './logger';
import { sleep } from './helpers';
import { Configuration } from './config';
import { writeStatusToDisk } from './write/status';
import Signer from 'orbs-signer-client';
import {
  initWeb3Client,
} from './write/ethereum';

import { readManagementStatus2 } from './leader'
import { Keeper, isLeader, shouldExecTask, execTask, getBalance, canSendTx, setGuardianEthAddr } from './keeper';
import * as tasksObj from './tasks_orig.json';
//import { stat } from 'fs';

export async function runLoop(config: Configuration) {
  const state = await initializeState(config);
  // initialize status.json to make sure healthcheck passes from now on  
  const runLoopPoolTimeMilli = 1000 * config.RunLoopPollTimeSeconds;

  // has to be called before setGuardians for management
  await readManagementStatus2(config.ManagementServiceEndpoint, config.NodeOrbsAddress, state);
  setGuardianEthAddr(state, config);

  for (; ;) {
    try {
      writeStatusToDisk(config.StatusJsonPath, state.status);
      // rest (to make sure we don't retry too aggressively on exceptions)
      // await sleep(config.RunLoopPollTimeSeconds * 1000);

      // main business logic
      await runLoopTick(config, state);

      // write status.json file, we don't mind doing this often (2min)
      // writeStatusToDisk(config.StatusJsonPath, state);

      const sleepTime = runLoopPoolTimeMilli - (Date.now() - Math.floor(Date.now() / runLoopPoolTimeMilli) * runLoopPoolTimeMilli) // align to tick interval
      await sleep(sleepTime); // TODO: move sleep to start of block

    } catch (err) {
      Logger.log('Exception thrown during runLoop, going back to sleep:');
      Logger.error(err.stack);

      // always write status.json file (and pass the error)
      // writeStatusToDisk(config.StatusJsonPath, state);
    }
  }
}

// runs every 2 minutes in prod, 1 second in tests
async function runLoopTick(config: Configuration, state: Keeper) {
  Logger.log('Run loop waking up.');

  // phase 1
  await readManagementStatus2(config.ManagementServiceEndpoint, config.NodeOrbsAddress, state);

  // split periodicUpdate into functions

  // sets leader index and name
  //setLeaderStatus(state); - DEPRECATED AMI

  // balance 
  await getBalance(state);

  // leader
  if (!isLeader(state)) return;
  Logger.log(`Node was selected as a leader`);

  // tasks execution    
  for (const t of tasksObj.tasks) {
    if (!(await canSendTx(state))) return;
    if (shouldExecTask(state, t)) {

      // first call - after that, task sets the next execution
      await execTask(state, t);
    }
  }
  // phase 2
  // checnage Keepr.ts to State.ts
  // add status, abi etc.

  // phase 3
  // await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, config);

  // phase 4
  // code opt. + cleanups  
}

// helpers

async function initializeState(config: Configuration): Promise<Keeper> {
  const state = new Keeper()

  // const state = new State();
  await initWeb3Client(config.EthereumEndpoint, state);
  state.signer = new Signer(config.SignerEndpoint);
  state.status.config = config;
  //await setGuardianAddr(state, config);

  return state;
}

//
// async function test() {
//
// 	const config : Configuration = {
// 		"ManagementServiceEndpoint": "http://34.235.246.172/services/matic-reader",
// 		"EthereumEndpoint": "https://speedy-nodes-nyc.moralis.io/e25f7625703c58a9068b9947/bsc/mainnet",
// 		"SignerEndpoint": "http://signer:7777",
// 		"EthereumDiscountGasPriceFactor": 1,
// 		"NodeOrbsAddress": "9f0988cd37f14dfe95d44cf21f9987526d6147ba",
// 		"StatusJsonPath": './status/status.json',
// 		"RunLoopPollTimeSeconds": 60,
// 		"BIUrl": "http://logs.orbs.network:3001/putes/keepersew",
// 	}
//
// 	const keeper = await initializeState(config);
//     const periodicCall = keeper.periodicUpdate.bind(keeper);
// 	await periodicCall(config);
// 	await keeper.dbgTask(`0x${config.NodeOrbsAddress}`);
//
// }
//
// test().then(console.log);
