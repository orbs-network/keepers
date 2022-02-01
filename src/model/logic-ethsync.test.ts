import test from 'ava';
import { State } from './state';
import { getCurrentClockTime } from '../helpers';
import { calcEthereumSyncStatus } from './logic-ethsync';
import { exampleConfig } from '../config.example';

// example state reflects no pending tx, eth in sync, not standby
function getExampleState() {
  const exampleState = new State();
  exampleState.ManagementRefTime = getCurrentClockTime() - 33;
  return exampleState;
}

test('eth in sync then drops out of sync then returns to sync', (t) => {
  const state = getExampleState();
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'operational');

  state.ManagementRefTime = getCurrentClockTime() - 120 * 60;
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'out-of-sync');

  state.ManagementRefTime = getCurrentClockTime() - 10 * 60;
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'operational');
});

test('tx reverted becomes stuck until reset', (t) => {
  const state = getExampleState();
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'operational');

  state.EthereumLastElectionsTx = {
    Status: 'revert',
    SendTime: 123,
    GasPriceStrategy: 'discount',
    GasPrice: 30000000000,
    TxHash: 'abc',
    EthBlock: 456,
    Type: 'ready-to-sync',
    LastPollTime: 789,
  };
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'need-reset');

  state.EthereumLastElectionsTx = {
    Status: 'final',
    SendTime: 123,
    GasPriceStrategy: 'discount',
    GasPrice: 30000000000,
    TxHash: 'abc',
    EthBlock: 456,
    Type: 'ready-to-sync',
    LastPollTime: 789,
  };
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'need-reset');
});

test('voted unready becomes stuck until reset', (t) => {
  const now = getCurrentClockTime();
  const state = getExampleState();
  state.ManagementMyElectionsStatus = {
    ReadyToSync: false,
    ReadyForCommittee: false,
    LastUpdateTime: now - 60,
    TimeToStale: 7 * 24 * 60 * 60,
  };
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'operational'); // since wakes up after an old vote unready

  state.ManagementMyElectionsStatus = {
    ReadyToSync: false,
    ReadyForCommittee: false,
    LastUpdateTime: now + 60,
    TimeToStale: 7 * 24 * 60 * 60,
  };
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'need-reset'); // since the vote unready is after launch time

  state.ManagementMyElectionsStatus = {
    ReadyToSync: true,
    ReadyForCommittee: true,
    LastUpdateTime: now + 60,
    TimeToStale: 7 * 24 * 60 * 60,
  };
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'need-reset');
});

test('failed to sync vcs becomes stuck until reset', (t) => {
  const state = getExampleState();
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'operational');
  t.assert(state.TimeEnteredStandbyWithoutVcSync == 0);

  state.ManagementIsStandby = true;
  state.VchainSyncStatus = 'exist-not-in-sync';
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'operational');
  t.assert(state.TimeEnteredStandbyWithoutVcSync > 0);

  state.TimeEnteredStandbyWithoutVcSync = getCurrentClockTime() - 25 * 60 * 60;
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'need-reset');

  state.TimeEnteredStandbyWithoutVcSync = 0;
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'need-reset');
});

test('failed to sync vcs counter is reset if out of standby or vcs sync', (t) => {
  const state = getExampleState();
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'operational');
  t.assert(state.TimeEnteredStandbyWithoutVcSync == 0);

  state.ManagementIsStandby = true;
  state.VchainSyncStatus = 'exist-not-in-sync';
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'operational');
  t.assert(state.TimeEnteredStandbyWithoutVcSync > 0);

  state.ManagementIsStandby = false;
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'operational');
  t.assert(state.TimeEnteredStandbyWithoutVcSync == 0);

  state.ManagementIsStandby = true;
  state.VchainSyncStatus = 'not-exist';
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'operational');
  t.assert(state.TimeEnteredStandbyWithoutVcSync > 0);

  state.VchainSyncStatus = 'in-sync';
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'operational');
  t.assert(state.TimeEnteredStandbyWithoutVcSync == 0);

  state.ManagementIsStandby = true;
  state.VchainSyncStatus = 'not-exist';
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'operational');
  t.assert(state.TimeEnteredStandbyWithoutVcSync > 0);

  state.TimeEnteredStandbyWithoutVcSync = getCurrentClockTime() - 25 * 60 * 60;
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'need-reset');
});

test('eth out of sync masks failed to sync vcs', (t) => {
  const state = getExampleState();
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'operational');
  t.assert(state.TimeEnteredStandbyWithoutVcSync == 0);

  state.ManagementRefTime = getCurrentClockTime() - 120 * 60;
  state.ManagementIsStandby = true;
  state.VchainSyncStatus = 'exist-not-in-sync';
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'out-of-sync');
  t.assert(state.TimeEnteredStandbyWithoutVcSync == 0);
});

test('pending tx then final then another pending', (t) => {
  const state = getExampleState();
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'operational');

  state.EthereumLastElectionsTx = {
    Status: 'pending',
    SendTime: 123,
    GasPriceStrategy: 'discount',
    GasPrice: 30000000000,
    TxHash: 'abc',
    EthBlock: 456,
    Type: 'ready-to-sync',
    LastPollTime: 789,
  };
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'tx-pending');

  state.EthereumLastElectionsTx = {
    Status: 'final',
    SendTime: 123,
    GasPriceStrategy: 'discount',
    GasPrice: 30000000000,
    TxHash: 'abc',
    EthBlock: 456,
    Type: 'ready-to-sync',
    LastPollTime: 789,
  };
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'operational');

  state.EthereumLastElectionsTx = {
    Status: 'pending',
    SendTime: 123,
    GasPriceStrategy: 'discount',
    GasPrice: 30000000000,
    TxHash: 'abc',
    EthBlock: 456,
    Type: 'ready-to-sync',
    LastPollTime: 789,
  };
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'tx-pending');
});

test('eth out of sync masks pending tx', (t) => {
  const state = getExampleState();
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'operational');

  state.ManagementRefTime = getCurrentClockTime() - 120 * 60;
  state.EthereumLastElectionsTx = {
    Status: 'pending',
    SendTime: 123,
    GasPriceStrategy: 'discount',
    GasPrice: 30000000000,
    TxHash: 'abc',
    EthBlock: 456,
    Type: 'ready-to-sync',
    LastPollTime: 789,
  };
  state.EthereumSyncStatus = calcEthereumSyncStatus(state, exampleConfig);
  t.is(state.EthereumSyncStatus, 'out-of-sync');
});
