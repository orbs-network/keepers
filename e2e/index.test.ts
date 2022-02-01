import test from 'ava';
import { TestEnvironment } from './driver';
import { join } from 'path';
import { sleep, getToday, getTenDayPeriod } from '../src/helpers';
import {
  deepDataMatcher,
  isValidEtherBalance,
  isPositiveNumber,
  isValidTimeRef,
  isValidBlock,
  isNonEmptyString,
  isPositiveFloat,
  isValidImageVersion,
} from './deep-matcher';

const driver = new TestEnvironment(join(__dirname, 'docker-compose.yml'));
driver.launchServices();

// node is OrbsAddress b1985d8a332bfc903fd437489ea933792fbfa500, EthAddress 98b4d71c78789637364a70f696227ec89e35626c
// node was voted unready, so "ReadyToSync": false, also the node is not standby
test.serial('[E2E] launches with one vchain out of sync -> sends ready-to-sync', async (t) => {
  t.log('started');
  driver.testLogger = t.log;
  t.timeout(60 * 1000);

  t.log('waiting until service launches');
  await sleep(2000);
  await driver.catJsonInService('app', '/opt/orbs/status/status.json');

  t.log('waiting until the first run loop completes');
  await sleep(4000);

  const status = await driver.catJsonInService('app', '/opt/orbs/status/status.json');
  t.log('status:', JSON.stringify(status, null, 2));

  const errors = deepDataMatcher(status.Payload, {
    Uptime: isPositiveNumber,
    MemoryUsage: {
      heapUsed: isPositiveNumber,
      rss: isPositiveNumber,
    },
    Version: {
      Semantic: isValidImageVersion,
    },
    EthereumSyncStatus: 'operational',
    VchainSyncStatus: 'exist-not-in-sync',
    EthereumBalanceLastPollTime: isValidTimeRef,
    EtherBalance: isValidEtherBalance,
    EthereumCanJoinCommitteeLastPollTime: 0,
    EthereumConsecutiveTxTimeouts: 0,
    EthereumLastElectionsTx: {
      Type: 'ready-to-sync',
      SendTime: isValidTimeRef,
      GasPriceStrategy: 'discount',
      GasPrice: 30000000000,
    },
    EthereumLastVoteUnreadyTime: {},
    VchainReputationsLastPollTime: isValidTimeRef,
    VchainReputations: {
      '42': {
        '1111111111111111111111111111111111111111': 2,
        '945dc264e11c09f8a518da6ce1bea493e0055b16': 6,
        '2222222222222222222222222222222222222222': 1,
      },
      '43': {},
    },
    VchainMetricsLastPollTime: isValidTimeRef,
    VchainMetrics: {
      '42': {
        LastBlockHeight: isValidBlock,
        LastBlockTime: isValidTimeRef,
        UptimeSeconds: isPositiveNumber,
      },
      '43': {
        LastBlockHeight: isValidBlock,
        LastBlockTime: isValidTimeRef,
        UptimeSeconds: isPositiveNumber,
      },
    },
    ManagementLastPollTime: isValidTimeRef,
    ManagementEthRefBlock: 3454,
    ManagementInCommittee: false,
    ManagementIsStandby: false,
    ManagementMyElectionStatus: {
      LastUpdateTime: isValidTimeRef,
      ReadyToSync: false,
      ReadyForCommittee: false,
    },
    TimeEnteredStandbyWithoutVcSync: 0,
    TimeEnteredBadReputation: {},
    TimeEnteredTopology: -1,
  });
  t.deepEqual(errors, []);

  const events = await driver.ethereumPosDriver.elections.web3Contract.getPastEvents('GuardianStatusUpdated');
  t.log('events:', JSON.stringify(events, null, 2));

  t.assert(events.length == 1);
  t.is(events[0].returnValues.guardian.toLowerCase(), '0x98b4d71c78789637364a70f696227ec89e35626c');
  t.is(events[0].returnValues.readyToSync, true);
  t.is(events[0].returnValues.readyForCommittee, false);
});

test.serial('[E2E] all vchains synced -> sends ready-for-committee', async (t) => {
  t.log('started');
  driver.testLogger = t.log;
  t.timeout(60 * 1000);

  t.log('telling mock to start showing chain-43 as synced');
  await driver.fetch('chain-43', 8080, 'change-mock-state/synced');
  await sleep(4000);

  const status = await driver.catJsonInService('app', '/opt/orbs/status/status.json');
  t.log('status:', JSON.stringify(status, null, 2));

  const errors = deepDataMatcher(status.Payload, {
    Uptime: isPositiveNumber,
    MemoryUsage: {
      heapUsed: isPositiveNumber,
      rss: isPositiveNumber,
    },
    EthereumSyncStatus: 'operational',
    VchainSyncStatus: 'in-sync',
    EthereumBalanceLastPollTime: isValidTimeRef,
    EtherBalance: isValidEtherBalance,
    EthereumCanJoinCommitteeLastPollTime: isValidTimeRef,
    EthereumConsecutiveTxTimeouts: 0,
    EthereumLastElectionsTx: {
      Type: 'ready-for-committee',
      SendTime: isValidTimeRef,
      GasPriceStrategy: 'discount',
      GasPrice: 30000000000,
    },
    EthereumLastVoteUnreadyTime: {},
    EthereumCommittedTxStats: {
      [getToday()]: isPositiveNumber,
    },
    VchainReputationsLastPollTime: isValidTimeRef,
    VchainReputations: {
      '42': {
        '1111111111111111111111111111111111111111': 2,
        '945dc264e11c09f8a518da6ce1bea493e0055b16': 6,
        '2222222222222222222222222222222222222222': 1,
      },
      '43': {},
    },
    VchainMetricsLastPollTime: isValidTimeRef,
    VchainMetrics: {
      '42': {
        LastBlockHeight: isValidBlock,
        LastBlockTime: isValidTimeRef,
        UptimeSeconds: isPositiveNumber,
      },
      '43': {
        LastBlockHeight: isValidBlock,
        LastBlockTime: isValidTimeRef,
        UptimeSeconds: isPositiveNumber,
      },
    },
    ManagementLastPollTime: isValidTimeRef,
    ManagementEthRefBlock: 3454,
    ManagementInCommittee: false,
    ManagementIsStandby: false,
    ManagementMyElectionStatus: {
      LastUpdateTime: isValidTimeRef,
      ReadyToSync: false,
      ReadyForCommittee: false,
    },
    TimeEnteredStandbyWithoutVcSync: 0,
    TimeEnteredBadReputation: {},
    TimeEnteredTopology: -1,
  });
  t.deepEqual(errors, []);

  const events = await driver.ethereumPosDriver.elections.web3Contract.getPastEvents('GuardianStatusUpdated');
  t.log('last event:', JSON.stringify(events, null, 2));

  t.assert(events.length == 1);
  t.is(events[0].returnValues.guardian.toLowerCase(), '0x98b4d71c78789637364a70f696227ec89e35626c');
  t.is(events[0].returnValues.readyToSync, true);
  t.is(events[0].returnValues.readyForCommittee, true);
});

test.serial('[E2E] enter committee -> sends vote unready for bad rep', async (t) => {
  t.log('started');
  driver.testLogger = t.log;
  t.timeout(60 * 1000);

  t.log('telling mock to start showing the node in the committee');
  await driver.fetch('management-service', 8080, 'change-mock-state/in-committee');
  await sleep(5000);

  const status = await driver.catJsonInService('app', '/opt/orbs/status/status.json');
  t.log('status:', JSON.stringify(status, null, 2));

  const errors = deepDataMatcher(status.Payload, {
    Uptime: isPositiveNumber,
    MemoryUsage: {
      heapUsed: isPositiveNumber,
      rss: isPositiveNumber,
    },
    EthereumSyncStatus: 'operational',
    VchainSyncStatus: 'in-sync',
    EthereumBalanceLastPollTime: isValidTimeRef,
    EtherBalance: isValidEtherBalance,
    EthereumCanJoinCommitteeLastPollTime: isValidTimeRef,
    EthereumConsecutiveTxTimeouts: 0,
    EthereumLastElectionsTx: {
      LastPollTime: isValidTimeRef,
      Type: 'ready-for-committee',
      SendTime: isValidTimeRef,
      GasPriceStrategy: 'discount',
      GasPrice: 30000000000,
      Status: 'final',
      TxHash: isNonEmptyString,
      EthBlock: isValidBlock,
    },
    EthereumLastVoteUnreadyTx: {
      LastPollTime: isValidTimeRef,
      Type: 'vote-unready',
      SendTime: isValidTimeRef,
      GasPriceStrategy: 'discount',
      GasPrice: 30000000000,
      Status: 'final',
      TxHash: isNonEmptyString,
      EthBlock: isValidBlock,
    },
    EthereumLastVoteUnreadyTime: {
      '94fda04016784d0348ec2ece7a9b24e3313885f0': isValidTimeRef,
    },
    EthereumCommittedTxStats: {
      [getToday()]: isPositiveNumber,
    },
    EthereumFeesStats: {
      [getTenDayPeriod()]: isPositiveFloat,
    },
    VchainReputationsLastPollTime: isValidTimeRef,
    VchainReputations: {
      '42': {
        '1111111111111111111111111111111111111111': 2,
        '945dc264e11c09f8a518da6ce1bea493e0055b16': 6,
        '2222222222222222222222222222222222222222': 1,
      },
      '43': {},
    },
    VchainMetricsLastPollTime: isValidTimeRef,
    VchainMetrics: {
      '42': {
        LastBlockHeight: isValidBlock,
        LastBlockTime: isValidTimeRef,
        UptimeSeconds: isPositiveNumber,
      },
      '43': {
        LastBlockHeight: isValidBlock,
        LastBlockTime: isValidTimeRef,
        UptimeSeconds: isPositiveNumber,
      },
    },
    ManagementLastPollTime: isValidTimeRef,
    ManagementEthRefBlock: 3454,
    ManagementInCommittee: true,
    ManagementIsStandby: false,
    ManagementMyElectionStatus: {
      LastUpdateTime: isValidTimeRef,
      ReadyToSync: false,
      ReadyForCommittee: false,
    },
    TimeEnteredStandbyWithoutVcSync: 0,
    TimeEnteredBadReputation: {
      '8a670ddc1910c27278ab7db2a148a0dccc6bf0f5': {
        '42': 0,
        '43': 0,
      },
      '94fda04016784d0348ec2ece7a9b24e3313885f0': {
        '42': isValidTimeRef,
        '43': 0,
      },
      '98b4d71c78789637364a70f696227ec89e35626c': {
        '42': 0,
        '43': 0,
      },
    },
    TimeEnteredTopology: -1,
  });
  t.deepEqual(errors, []);

  const events = await driver.ethereumPosDriver.elections.web3Contract.getPastEvents('VoteUnreadyCasted');
  t.log('last event:', JSON.stringify(events, null, 2));

  t.assert(events.length == 1);
  t.is(events[0].returnValues.voter.toLowerCase(), '0x98b4d71c78789637364a70f696227ec89e35626c');
  t.is(events[0].returnValues.subject.toLowerCase(), '0x94fda04016784d0348ec2ece7a9b24e3313885f0');
});
