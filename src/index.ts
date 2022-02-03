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

  for (;;) {
    try {
      // rest (to make sure we don't retry too aggressively on exceptions)
      // await sleep(config.RunLoopPollTimeSeconds * 1000);

      // main business logic
      await runLoopTick(config, state);

      // write status.json file, we don't mind doing this often (2min)
      // writeStatusToDisk(config.StatusJsonPath, state);

      await sleep(config.RunLoopPollTimeSeconds * 1000); // TODO: move sleep to start of block

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

  await state.periodicUpdate(config);


}

// helpers

async function initializeState(config: Configuration): Promise<Keeper> {
  const keeper = new Keeper()

  // const state = new State();
  await initWeb3Client(config.EthereumEndpoint, keeper);
  keeper.signer = new Signer(config.SignerEndpoint);
  return keeper;
}


