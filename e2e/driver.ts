import test from 'ava';
import { dockerComposeTool, getAddressForService } from 'docker-compose-mocha';
import { unlinkSync, writeFileSync } from 'fs';
import { exec } from 'child_process';
import { exec as execPromise } from 'child-process-promise';
import { retry } from 'ts-retry-promise';
import { join } from 'path';
import fetch from 'node-fetch';
import { sleep } from '../src/helpers';
import HDWalletProvider from 'truffle-hdwallet-provider';
import Web3 from 'web3';
import { Driver as EthereumPosDriver } from '@orbs-network/orbs-ethereum-contracts-v2';
import BN from 'bn.js';
import { GammaDriver } from './gamma/driver';

export class TestEnvironment {
  private envName: string = '';
  public ethereumPosDriver: EthereumPosDriver;
  public gammaDriver: GammaDriver;
  public nodeOrbsAddress: string;
  public testLogger: (lines: string) => void;

  constructor(private pathToDockerCompose: string) {}

  getAppConfig() {
    return {
      ManagementServiceEndpoint: 'http://management-service:8080',
      EthereumEndpoint: 'http://ganache:7545',
      SignerEndpoint: 'http://signer:7777',
      EthereumElectionsContract: this.ethereumPosDriver.elections.address,
      NodeOrbsAddress: this.nodeOrbsAddress.substr(2).toLowerCase(), // remove "0x",
      VirtualChainEndpointSchema: 'http://chain-{{ID}}:8080',
      RunLoopPollTimeSeconds: 1,
      EthereumBalancePollTimeSeconds: 1,
      EthereumCanJoinCommitteePollTimeSeconds: 1,
      OrbsReputationsContract: 'MockCommittee',
      VchainUptimeRequiredSeconds: 2,
      VchainSyncThresholdSeconds: 5 * 60,
      VchainOutOfSyncThresholdSeconds: 60 * 60,
      VchainStuckThresholdSeconds: 2 * 60 * 60,
      EthereumSyncRequirementSeconds: 20 * 60,
      FailToSyncVcsTimeoutSeconds: 24 * 60 * 60,
      ElectionsRefreshWindowSeconds: 2 * 60 * 60,
      InvalidReputationGraceSeconds: 1, // so we send vote unreadys quickly
      VoteUnreadyValiditySeconds: 7 * 24 * 60 * 60,
      ElectionsAuditOnly: false,
      SuspendVoteUnready: false,
      EthereumDiscountGasPriceFactor: 0.75,
      EthereumDiscountTxTimeoutSeconds: 60 * 60,
      EthereumNonDiscountTxTimeoutSeconds: 10 * 60,
      EthereumMaxGasPrice: 150000000000, // 150 gwei
      EthereumMaxCommittedDailyTx: 20,
    };
  }

  // runs all the docker instances with docker-compose
  launchServices() {
    test.serial.before((t) => t.log('[E2E] driver launchServices() start'));

    // step 1 - launch ganache, management-service mock and gamma dockers
    test.serial.before((t) => t.log('[E2E] launch ganache, signer, management-service, chain-42, chain-43 dockers'));
    this.envName = dockerComposeTool(
      test.serial.before.bind(test.serial),
      test.serial.after.always.bind(test.serial.after),
      this.pathToDockerCompose,
      {
        startOnlyTheseServices: ['ganache', 'signer', 'management-service', 'chain-42', 'chain-43'],
        containerCleanUp: false,
      } as any
    );

    // step 2 - let ganache warm up
    test.serial.before(async (t) => {
      t.log('[E2E] wait 5 seconds for ganache to warm up');
      await sleep(5000);
    });

    // step 3 - deploy ethereum PoS contracts to ganache
    test.serial.before(async (t) => {
      t.log('[E2E] deploy ethereum PoS contracts to ganache');
      t.timeout(5 * 60 * 1000);
      const ganacheAddress = await getAddressForService(this.envName, this.pathToDockerCompose, 'ganache', 7545);
      console.log(`[posv2] about to deploy contracts`);
      this.ethereumPosDriver = await EthereumPosDriver.new({
        web3Provider: () => {
          return new Web3(
            new (HDWalletProvider as any)(
              'vanish junk genuine web seminar cook absurd royal ability series taste method identify elevator liquid',
              `http://localhost:${portFromAddress(ganacheAddress)}`,
              0,
              100,
              false
            )
          );
        },
      });
      // create the guardian, give some stake (above minimum of 100) and register
      console.log(`[posv2] about to set up initial node`);
      const guardian = this.ethereumPosDriver.newParticipant();
      const stake = new BN(1000);
      await guardian.stake(stake);
      await guardian.registerAsGuardian();
      this.nodeOrbsAddress = guardian.orbsAddress;
      console.log(`[posv2] driver.nodeOrbsAddress = ${this.nodeOrbsAddress}, ethAddress = ${guardian.address}`);
      const peer = this.ethereumPosDriver.newParticipant();
      await peer.stake(stake);
      await peer.registerAsGuardian();
      await peer.readyForCommittee();
      console.log(`[posv2] peer ethAddress for vote unreadys = ${peer.address}, orbsAddress = ${peer.orbsAddress}`);
    });

    // step 4 - deploy Orbs contracts to gamma
    test.serial.before(async (t) => {
      t.log('[E2E] deploy Orbs contracts to gamma');
      t.timeout(60 * 1000);
      // note that gamma virtual chain id is always hard-coded as 42
      const gammaAddress = await getAddressForService(this.envName, this.pathToDockerCompose, 'chain-42', 8080);
      this.gammaDriver = await new GammaDriver().init(`http://localhost:${portFromAddress(gammaAddress)}`, 42);
    });

    // step 5 - write config file for app
    test.serial.before((t) => {
      t.log('[E2E] write config file for app');
      const configFilePath = join(__dirname, 'app-config.json');
      try {
        unlinkSync(configFilePath);
      } catch (err) {}
      const config = this.getAppConfig();
      if (require('./signer/keys.json')['node-address'] != config.NodeOrbsAddress) {
        throw new Error(
          `Incorrect address in ./signer/keys.json, use address ${config.NodeOrbsAddress} with private key ${(this
            .ethereumPosDriver.web3.currentProvider as any).wallets['0x' + config.NodeOrbsAddress]._privKey.toString(
            'hex'
          )}`
        );
      }
      writeFileSync(configFilePath, JSON.stringify(config));
    });

    // step 6 - launch app docker
    test.serial.before((t) => t.log('[E2E] launch app docker'));
    dockerComposeTool(
      test.serial.before.bind(test.serial),
      test.serial.after.always.bind(test.serial.after),
      this.pathToDockerCompose,
      {
        envName: this.envName,
        startOnlyTheseServices: ['app'],
        shouldPullImages: false,
        cleanUp: false,
      } as any
    );

    // // old step - print app logs from docker on failure
    // test.serial.afterEach.always('print logs on failures', async (t) => {
    //   if (t.passed) return;
    //   const logs = await getLogsForService(this.envName, this.pathToDockerCompose, 'app');
    //   console.log(logs);
    // });

    // step 7 - start live dump of logs from app to test logger
    test.serial.before(async (t) => {
      t.log('[E2E] start live dump of logs from app to test logger');
      const logP = exec(`docker-compose -p ${this.envName} -f "${this.pathToDockerCompose}" logs -f app`);
      this.testLogger = t.log;
      logP.stdout.on('data', (data) => {
        if (this.testLogger) this.testLogger(data);
      });
      logP.on('exit', () => {
        if (this.testLogger) this.testLogger(`app log exited`);
      });
    });

    test.serial.before((t) => t.log('[E2E] driver launchServices() finished'));
  }

  // inspired by https://github.com/applitools/docker-compose-mocha/blob/master/lib/get-logs-for-service.js
  async catJsonInService(serviceName: string, filePath: string) {
    return await retry(
      async () => {
        const data = (
          await execPromise(
            `docker-compose -p ${this.envName} -f "${this.pathToDockerCompose}" exec -T ${serviceName} cat "${filePath}"`
          )
        ).stdout;
        return JSON.parse(data);
      },
      { retries: 10, delay: 300 }
    );
  }

  async fetch(serviceName: string, port: number, path: string) {
    const addr = await getAddressForService(this.envName, this.pathToDockerCompose, serviceName, port);
    return await retry(
      async () => {
        const response = await fetch(`http://${addr}/${path}`);
        const body = await response.text();
        try {
          return JSON.parse(body);
        } catch (e) {
          throw new Error(`invalid response:\n${body}`);
        }
      },
      { retries: 10, delay: 300 }
    );
  }
}

function portFromAddress(address: string) {
  return address.split(':')[1];
}
