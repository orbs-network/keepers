import * as Logger from './logger';

//import { runLoop } from '.';
import { parseArgs } from './cli-args';
import { Keeper } from './keeper';

process.on('uncaughtException', function (err) {
  Logger.log('Uncaught exception on process, shutting down:');
  Logger.error(err.stack);
  process.exit(1);
});

process.on('SIGINT', function () {
  Logger.log('Received SIGINT, shutting down.');
  process.exit();
});

Logger.log('Service keepers started.');
const config = parseArgs(process.argv);
Logger.log(`Input config: '${JSON.stringify(config)}'.`);

const keeper = new Keeper()
keeper.start().catch((err) => {
  Logger.log('Exception thrown from keeper.start, shutting down:');
  Logger.error(err.stack);
  process.exit(128);
});

