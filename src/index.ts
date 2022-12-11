import * as Logger from './logger';
import { sleep } from './helpers';
import { Configuration } from './config';
import { writeStatusToDisk } from './write/status';
import {
  initWeb3Client,
} from './write/ethereum';

import { Keeper } from './keeper';

export async function runLoop(config: Configuration) {
  const keepers = await initializeState(config);
  if (process.env.DEBUG) {
    Logger.log(`DEBUG mode -----------------`);
    //config.RunLoopPollTimeSeconds = 10;
    //console.log(`RunLoopPollTimeSeconds: 10 sec`);
  }

  Logger.log(`ENV ALWAYS_LEADER: ${process.env.ALWAYS_LEADER}`);
  Logger.log(`ENV NODE_ENV: ${process.env.NODE_ENV}`);

  // initialize status.json to make sure healthcheck passes from now on
  //const runLoopPoolTimeMilli = 1000 * config.RunLoopPollTimeSeconds;

  for (; ;) {
    // write status.json file, we don't mind doing this often (2min)
    keepers.setStatus();
    writeStatusToDisk(config.StatusJsonPath, keepers.status);
    try {
      // main business logic
      // runs every 2 minutes in prod, 1 second in tests
      if (keepers.status.tickCount % 100 === 0)
        Logger.log(`Run loop waking up. tick: ${keepers.status.tickCount}`);

      await keepers.onTick();

      // SLEEP TODO: 30 sec minutes
      // const sleepTime = runLoopPoolTimeMilli - (Date.now() - Math.floor(Date.now() / runLoopPoolTimeMilli) * 
      const sleepTime = Math.floor(keepers.pacer.getEpochUnitMS() / 2.1);  // not /2 on pupose
      await sleep(sleepTime);

    } catch (err) {
      Logger.log('Exception thrown during runLoop, going back to sleep:');
      Logger.error(err.stack);

      // always write status.json file (and pass the error)
      keepers.status.error = err.stack;
      writeStatusToDisk(config.StatusJsonPath, keepers.status);
    }
  }
}


// helpers
async function initializeState(config: Configuration): Promise<Keeper> {
  const keepers = new Keeper()

  // const state = new State();
  await initWeb3Client(config.EthereumEndpoint, keepers);
  keepers.status.config = config;

  return keepers;
}