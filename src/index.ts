import * as Logger from './logger';
import { sleep } from './helpers';
import { Configuration } from './config';
import { writeStatusToDisk } from './write/status';
import {
  initWeb3Client,
} from './write/ethereum';

import { readManagementStatus2 } from './leader'
import { Keeper } from './keeper';
import * as tasksObj from './tasks.json';


export async function runLoop(config: Configuration) {
  const keepers = await initializeState(config);
  if (process.env.DEBUG) {
    Logger.log(`DEBUG mode -----------------`);
    config.RunLoopPollTimeSeconds = 10;
    console.log(`RunLoopPollTimeSeconds: 10 sec`);
  }

  // initialize status.json to make sure healthcheck passes from now on
  const runLoopPoolTimeMilli = 1000 * config.RunLoopPollTimeSeconds;

  for (; ;) {
    try {
      // has to be called before setGuardians for management
      const statusOK = await readManagementStatus2(config.ManagementServiceEndpoint, config.NodeOrbsAddress, keepers);
      if (!statusOK) {
        Logger.error(`readManagementStatus2 failed, url=${config.ManagementServiceEndpoint}`);
        continue;
      }

      keepers.setGuardianEthAddr(config);
      // make sure tasks are visible in svc status
      keepers.status.tasks = tasksObj;

      // updates the json
      keepers.setStatus();
      // write status.json file, we don't mind doing this often (2min)
      writeStatusToDisk(config.StatusJsonPath, keepers.status);

      // main business logic
      await runLoopTick(config, keepers);

      // SLEEP 2 minutes
      const sleepTime = runLoopPoolTimeMilli - (Date.now() - Math.floor(Date.now() / runLoopPoolTimeMilli) * runLoopPoolTimeMilli) // align to tick interval
      await sleep(sleepTime);

    } catch (err) {
      Logger.log('Exception thrown during runLoop, going back to sleep:');
      Logger.error(err.stack);

      // always write status.json file (and pass the error)
      keepers.status.error = err.stack;
      writeStatusToDisk(config.StatusJsonPath, keepers);
    }
  }
}

// runs every 2 minutes in prod, 1 second in tests
async function runLoopTick(config: Configuration, keepers: Keeper) {
  if (keepers.status.tickCount % 10 === 0)
    Logger.log(`Run loop waking up. tick: ${keepers.status.tickCount}`);

  keepers.status.tickCount += 1;

  // phase 1
  await readManagementStatus2(config.ManagementServiceEndpoint, config.NodeOrbsAddress, keepers);

  // balance
  await keepers.getBalance(); /// ??? WHY check

  // leader  
  const isLeader = keepers.isLeader();

  // tasks execution
  for (const t of tasksObj.tasks) {
    if (keepers.shouldExecTask(t)) {
      // first call - after that, task sets the next execution
      if (isLeader)
        await keepers.execTask(t);
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