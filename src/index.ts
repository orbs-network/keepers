import { Keeper } from './keeper';

import * as Logger from './logger';
import { sleep } from './helpers';
import { Configuration } from './config';
// import { writeStatusToDisk } from './write/status';
import Signer from 'orbs-signer-client';
import {
  initWeb3Client,
} from './write/ethereum';

export async function runLoop(config: Configuration) {
  const state = await initializeState(config);
  // initialize status.json to make sure healthcheck passes from now on
  // writeStatusToDisk(config.StatusJsonPath, state);
  const runLoopPoolTimeMilli = 1000 * config.RunLoopPollTimeSeconds;

  for (;;) {
    try {
      // rest (to make sure we don't retry too aggressively on exceptions)
      // await sleep(config.RunLoopPollTimeSeconds * 1000);

      // main business logic
      await runLoopTick(config, state);

      // write status.json file, we don't mind doing this often (2min)
      // writeStatusToDisk(config.StatusJsonPath, state);

      const sleepTime = runLoopPoolTimeMilli - (Date.now() - Math.floor(Date.now()/runLoopPoolTimeMilli)* runLoopPoolTimeMilli) // align to tick interval

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
  // await readManagementStatus(config.ManagementServiceEndpoint, config.NodeOrbsAddress, state);
  // split periodicUpdate into functions

  // phase 2
  // add status, abi etc.

  // phase 3
  // await readPendingTransactionStatus(state.EthereumLastElectionsTx, state, config);

  // phase 4
  // code opt. + cleanups
  const periodicCall = state.periodicUpdate.bind(state);
  await periodicCall(config);
}

// helpers

async function initializeState(config: Configuration): Promise<Keeper> {
  const keeper = new Keeper()

  // const state = new State();
  await initWeb3Client(config.EthereumEndpoint, keeper);
  keeper.signer = new Signer(config.SignerEndpoint);
  await keeper.setGuardianAddr(config);
  return keeper;
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
