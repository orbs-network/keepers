import test from 'ava';
import { State } from './state';
import { getCurrentClockTime } from '../helpers';
import { calcVchainSyncStatus } from './logic-vcsync';
import { exampleConfig } from '../config.example';

// example state reflects all vcs in sync and live
function getExampleState() {
  const exampleState = new State();
  exampleState.ManagementRefTime = getCurrentClockTime();
  exampleState.TimeEnteredTopology = getCurrentClockTime() - 24 * 60 * 60;
  exampleState.VchainMetrics['1000'] = {
    LastBlockHeight: 5000,
    UptimeSeconds: 3000,
    LastBlockTime: getCurrentClockTime() - 35,
    LastCommitTime: getCurrentClockTime() - 35,
  };
  exampleState.VchainMetrics['1001'] = {
    LastBlockHeight: 5000,
    UptimeSeconds: 3000,
    LastBlockTime: getCurrentClockTime() - 42,
    LastCommitTime: getCurrentClockTime() - 42,
  };
  exampleState.ManagementVirtualChains['1000'] = getPostGenesisVc();
  exampleState.ManagementVirtualChains['1001'] = getPostGenesisVc();
  return exampleState;
}

function getPostGenesisVc() {
  return {
    GenesisRefTime: getCurrentClockTime() - 100 * 24 * 60 * 60,
    Expiration: getCurrentClockTime() + 100 * 24 * 60 * 60,
    RolloutGroup: 'main', // not important
    IdentityType: 0, // not important
    Tier: 'b0', // not important
  };
}

function getPreGenesisVc() {
  return {
    GenesisRefTime: getCurrentClockTime() + 24 * 60 * 60,
    Expiration: getCurrentClockTime() + 100 * 24 * 60 * 60,
    RolloutGroup: 'main', // not important
    IdentityType: 0, // not important
    Tier: 'b0', // not important
  };
}

test('in sync becomes out of sync and returns to sync', (t) => {
  const state = getExampleState();
  state.VchainSyncStatus = calcVchainSyncStatus(state, exampleConfig);
  t.is(state.VchainSyncStatus, 'in-sync');

  state.VchainMetrics['1001'].LastBlockTime = getCurrentClockTime() - 24 * 60 * 60;
  state.VchainSyncStatus = calcVchainSyncStatus(state, exampleConfig);
  t.is(state.VchainSyncStatus, 'exist-not-in-sync');

  state.VchainMetrics['1001'].LastCommitTime = getCurrentClockTime() - 24 * 60 * 60; // together with TimeEnteredTopology in setup becomes VCStuck
  state.VchainSyncStatus = calcVchainSyncStatus(state, exampleConfig);
  t.is(state.VchainSyncStatus, 'in-sync');

  state.TimeEnteredTopology = getCurrentClockTime() - 1 * 60 * 60; // no longer VCStuck 1
  state.VchainSyncStatus = calcVchainSyncStatus(state, exampleConfig);
  t.is(state.VchainSyncStatus, 'exist-not-in-sync');

  state.TimeEnteredTopology = getCurrentClockTime() - 24 * 60 * 60; // together with old LastCommitTime return to VCStuck
  state.VchainSyncStatus = calcVchainSyncStatus(state, exampleConfig);
  t.is(state.VchainSyncStatus, 'in-sync');

  state.VchainMetrics['1001'].LastCommitTime = getCurrentClockTime() - 38; // no longer VCStuck 2
  state.VchainSyncStatus = calcVchainSyncStatus(state, exampleConfig);
  t.is(state.VchainSyncStatus, 'exist-not-in-sync');

  state.VchainMetrics['1001'].LastBlockTime = getCurrentClockTime() - 13;
  state.VchainSyncStatus = calcVchainSyncStatus(state, exampleConfig);
  t.is(state.VchainSyncStatus, 'in-sync');
});

test('new vchain becomes out of sync then in sync', (t) => {
  const state = getExampleState();
  state.VchainMetrics['1001'].UptimeSeconds = -1;
  state.VchainMetrics['1001'].LastBlockTime = -1;
  state.VchainSyncStatus = calcVchainSyncStatus(state, exampleConfig);
  t.is(state.VchainSyncStatus, 'not-exist');

  state.VchainMetrics['1001'].UptimeSeconds = 1;
  state.VchainMetrics['1001'].LastBlockTime = 0;
  state.VchainSyncStatus = calcVchainSyncStatus(state, exampleConfig);
  t.is(state.VchainSyncStatus, 'not-exist');

  state.VchainMetrics['1001'].UptimeSeconds = 14;
  state.VchainMetrics['1001'].LastBlockTime = 0;
  state.VchainSyncStatus = calcVchainSyncStatus(state, exampleConfig);
  t.is(state.VchainSyncStatus, 'exist-not-in-sync');

  state.VchainMetrics['1001'].LastBlockTime = getCurrentClockTime() - 13;
  state.VchainSyncStatus = calcVchainSyncStatus(state, exampleConfig);
  t.is(state.VchainSyncStatus, 'in-sync');
});

test('in sync ignores newly created vc that is not live yet', (t) => {
  const state = getExampleState();
  state.VchainSyncStatus = calcVchainSyncStatus(state, exampleConfig);
  t.is(state.VchainSyncStatus, 'in-sync');

  state.VchainMetrics['1002'] = {
    LastBlockHeight: 0,
    UptimeSeconds: 10,
    LastBlockTime: 0,
    LastCommitTime: 0,
  };
  state.ManagementVirtualChains['1002'] = getPreGenesisVc();
  state.VchainSyncStatus = calcVchainSyncStatus(state, exampleConfig);
  t.is(state.VchainSyncStatus, 'in-sync');
});

test('zero vcs and then a newly created vc that is not live yet', (t) => {
  const state = getExampleState();
  state.VchainMetrics = {};
  state.ManagementVirtualChains = {};
  state.VchainSyncStatus = calcVchainSyncStatus(state, exampleConfig);
  t.is(state.VchainSyncStatus, 'in-sync');

  state.VchainMetrics['1000'] = {
    LastBlockHeight: 0,
    UptimeSeconds: 10,
    LastBlockTime: 0,
    LastCommitTime: 0,
  };
  state.ManagementVirtualChains['1000'] = getPreGenesisVc();
  state.VchainSyncStatus = calcVchainSyncStatus(state, exampleConfig);
  t.is(state.VchainSyncStatus, 'in-sync');
});
