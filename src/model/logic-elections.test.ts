/* eslint-disable @typescript-eslint/no-non-null-assertion */
import test from 'ava';
import { State } from './state';
import { shouldNotifyReadyToSync, shouldNotifyReadyForCommittee, shouldCheckCanJoinCommittee } from './logic-elections';
import { exampleConfig } from '../config.example';
import { getCurrentClockTime, getToday } from '../helpers';

const STALE_UPDATE_GRACE = 7 * 24 * 60 * 60;

// example state reflects operational eth state and standbys full (5) and not stale
function getExampleState() {
  const exampleState = new State();
  exampleState.EthereumSyncStatus = 'operational';
  exampleState.ManagementRefTime = getCurrentClockTime() - 3 * 60;
  exampleState.ManagementCurrentStandbys = [
    { EthAddress: 's1' },
    { EthAddress: 's2' },
    { EthAddress: 's3' },
    { EthAddress: 's4' },
    { EthAddress: 's5' },
  ];
  exampleState.ManagementOthersElectionsStatus = {
    s1: {
      LastUpdateTime: getCurrentClockTime(),
      ReadyToSync: true,
      ReadyForCommittee: false,
      TimeToStale: STALE_UPDATE_GRACE,
    },
    s2: {
      LastUpdateTime: getCurrentClockTime(),
      ReadyToSync: true,
      ReadyForCommittee: false,
      TimeToStale: STALE_UPDATE_GRACE,
    },
    s3: {
      LastUpdateTime: getCurrentClockTime(),
      ReadyToSync: true,
      ReadyForCommittee: false,
      TimeToStale: STALE_UPDATE_GRACE,
    },
    s4: {
      LastUpdateTime: getCurrentClockTime(),
      ReadyToSync: true,
      ReadyForCommittee: false,
      TimeToStale: STALE_UPDATE_GRACE,
    },
    s5: {
      LastUpdateTime: getCurrentClockTime(),
      ReadyToSync: true,
      ReadyForCommittee: false,
      TimeToStale: STALE_UPDATE_GRACE,
    },
  };
  return exampleState;
}

function getAuditConfig() {
  return { ...exampleConfig, ElectionsAuditOnly: true };
}

test('shouldNotifyReadyToSync: new node with standbys full', (t) => {
  const state = getExampleState();
  state.VchainSyncStatus = 'not-exist';
  t.false(shouldNotifyReadyToSync(state, exampleConfig));

  state.VchainSyncStatus = 'exist-not-in-sync';
  t.true(shouldNotifyReadyToSync(state, exampleConfig));

  state.ManagementMyElectionsStatus = {
    LastUpdateTime: getCurrentClockTime() - 2 * 24 * 60 * 60,
    ReadyToSync: true,
    ReadyForCommittee: false,
    TimeToStale: STALE_UPDATE_GRACE - 2 * 24 * 60 * 60,
  };
  t.false(shouldNotifyReadyToSync(state, exampleConfig));

  state.ManagementMyElectionsStatus = {
    LastUpdateTime: getCurrentClockTime() - 20 * 24 * 60 * 60,
    ReadyToSync: true,
    ReadyForCommittee: false,
    TimeToStale: 0,
  };
  t.true(shouldNotifyReadyToSync(state, exampleConfig));

  state.ManagementMyElectionsStatus = {
    LastUpdateTime: getCurrentClockTime() - 2 * 24 * 60 * 60,
    ReadyToSync: false,
    ReadyForCommittee: false,
    TimeToStale: STALE_UPDATE_GRACE - 2 * 24 * 60 * 60,
  };
  t.true(shouldNotifyReadyToSync(state, exampleConfig));

  state.ManagementIsStandby = true;
  t.false(shouldNotifyReadyToSync(state, exampleConfig));

  state.ManagementIsStandby = false;
  t.true(shouldNotifyReadyToSync(state, exampleConfig));

  state.ManagementIsStandby = true;
  t.false(shouldNotifyReadyToSync(state, exampleConfig));
});

test('shouldNotifyReadyToSync: standby slot becomes available', (t) => {
  const state = getExampleState();
  state.VchainSyncStatus = 'exist-not-in-sync';
  state.ManagementMyElectionsStatus = {
    LastUpdateTime: getCurrentClockTime() - 2 * 24 * 60 * 60,
    ReadyToSync: true,
    ReadyForCommittee: false,
    TimeToStale: STALE_UPDATE_GRACE - 2 * 24 * 60 * 60,
  };
  t.false(shouldNotifyReadyToSync(state, exampleConfig));

  state.ManagementOthersElectionsStatus['s1']!.TimeToStale = 0;
  t.true(shouldNotifyReadyToSync(state, exampleConfig));

  state.ManagementOthersElectionsStatus['s1']!.TimeToStale = STALE_UPDATE_GRACE;
  t.false(shouldNotifyReadyToSync(state, exampleConfig));

  state.ManagementCurrentStandbys.pop();
  t.true(shouldNotifyReadyToSync(state, exampleConfig));
});

test('shouldNotifyReadyToSync: only when ethereum state is operational', (t) => {
  const state = getExampleState();
  state.VchainSyncStatus = 'exist-not-in-sync';
  t.true(shouldNotifyReadyToSync(state, exampleConfig));

  state.EthereumSyncStatus = 'out-of-sync';
  t.false(shouldNotifyReadyToSync(state, exampleConfig));

  state.EthereumSyncStatus = 'tx-pending';
  t.false(shouldNotifyReadyToSync(state, exampleConfig));

  state.EthereumSyncStatus = 'need-reset';
  t.false(shouldNotifyReadyToSync(state, exampleConfig));

  state.EthereumSyncStatus = 'operational';
  t.true(shouldNotifyReadyToSync(state, exampleConfig));
});

test('shouldNotifyReadyToSync: audit-only keeps position in standby', (t) => {
  const state = getExampleState();
  state.ManagementIsStandby = true;
  state.VchainSyncStatus = 'in-sync';
  t.true(shouldNotifyReadyToSync(state, getAuditConfig()));

  state.VchainSyncStatus = 'exist-not-in-sync';
  t.false(shouldNotifyReadyToSync(state, getAuditConfig()));

  state.VchainSyncStatus = 'in-sync';
  state.ManagementMyElectionsStatus = {
    LastUpdateTime: getCurrentClockTime() - 2 * 24 * 60 * 60,
    ReadyToSync: true,
    ReadyForCommittee: false,
    TimeToStale: STALE_UPDATE_GRACE - 2 * 24 * 60 * 60,
  };
  t.false(shouldNotifyReadyToSync(state, getAuditConfig()));

  state.ManagementMyElectionsStatus = {
    LastUpdateTime: getCurrentClockTime() - 20 * 24 * 60 * 60,
    ReadyToSync: true,
    ReadyForCommittee: false,
    TimeToStale: 0,
  };
  t.true(shouldNotifyReadyToSync(state, getAuditConfig()));
});

test('shouldNotifyReadyToSync: too many successful daily tx', (t) => {
  const state = getExampleState();
  state.EthereumCommittedTxStats[getToday()] = exampleConfig.EthereumMaxCommittedDailyTx;
  state.VchainSyncStatus = 'exist-not-in-sync';
  t.false(shouldNotifyReadyToSync(state, exampleConfig));
});

test('shouldNotifyReadyForCommittee: new node finished syncing', (t) => {
  const state = getExampleState();
  state.VchainSyncStatus = 'exist-not-in-sync';
  t.false(shouldNotifyReadyForCommittee(state, false, exampleConfig));

  state.VchainSyncStatus = 'in-sync';
  t.true(shouldNotifyReadyForCommittee(state, false, exampleConfig));

  t.false(shouldNotifyReadyForCommittee(state, false, getAuditConfig()));

  state.ManagementIsStandby = true;
  t.true(shouldNotifyReadyForCommittee(state, false, exampleConfig));

  state.ManagementInCommittee = true;
  t.false(shouldNotifyReadyForCommittee(state, false, exampleConfig));

  state.ManagementInCommittee = false;
  state.ManagementMyElectionsStatus = {
    LastUpdateTime: getCurrentClockTime() - 2 * 24 * 60 * 60,
    ReadyToSync: true,
    ReadyForCommittee: true,
    TimeToStale: STALE_UPDATE_GRACE - 2 * 24 * 60 * 60,
  };
  t.false(shouldNotifyReadyForCommittee(state, false, exampleConfig));

  state.ManagementMyElectionsStatus = {
    LastUpdateTime: getCurrentClockTime() - 2 * 24 * 60 * 60,
    ReadyToSync: true,
    ReadyForCommittee: false,
    TimeToStale: STALE_UPDATE_GRACE - 2 * 24 * 60 * 60,
  };
  t.true(shouldNotifyReadyForCommittee(state, false, exampleConfig));
});

test('shouldNotifyReadyForCommittee: standby in sync going stale', (t) => {
  const state = getExampleState();
  state.ManagementIsStandby = true;
  state.VchainSyncStatus = 'in-sync';
  state.ManagementMyElectionsStatus = {
    LastUpdateTime: getCurrentClockTime() - 2 * 24 * 60 * 60,
    ReadyToSync: true,
    ReadyForCommittee: true,
    TimeToStale: STALE_UPDATE_GRACE - 2 * 24 * 60 * 60,
  };
  t.false(shouldNotifyReadyForCommittee(state, false, exampleConfig));
  t.true(shouldNotifyReadyForCommittee(state, true, exampleConfig));

  state.ManagementMyElectionsStatus = {
    LastUpdateTime: getCurrentClockTime() - 20 * 24 * 60 * 60,
    ReadyToSync: true,
    ReadyForCommittee: true,
    TimeToStale: 0,
  };
  t.true(shouldNotifyReadyForCommittee(state, false, exampleConfig));
  t.true(shouldNotifyReadyForCommittee(state, true, exampleConfig));

  t.false(shouldNotifyReadyForCommittee(state, false, getAuditConfig()));
});

test('shouldNotifyReadyForCommittee: only when ethereum state is operational', (t) => {
  const state = getExampleState();
  state.ManagementIsStandby = true;
  state.VchainSyncStatus = 'in-sync';
  state.ManagementMyElectionsStatus = {
    LastUpdateTime: getCurrentClockTime() - 20 * 24 * 60 * 60,
    ReadyToSync: true,
    ReadyForCommittee: true,
    TimeToStale: 0,
  };
  t.true(shouldNotifyReadyForCommittee(state, false, exampleConfig));
  t.true(shouldNotifyReadyForCommittee(state, true, exampleConfig));

  state.EthereumSyncStatus = 'out-of-sync';
  t.false(shouldNotifyReadyForCommittee(state, true, exampleConfig));

  state.EthereumSyncStatus = 'tx-pending';
  t.false(shouldNotifyReadyForCommittee(state, true, exampleConfig));

  state.EthereumSyncStatus = 'need-reset';
  t.false(shouldNotifyReadyForCommittee(state, true, exampleConfig));

  state.EthereumSyncStatus = 'operational';
  t.true(shouldNotifyReadyForCommittee(state, false, exampleConfig));
  t.true(shouldNotifyReadyForCommittee(state, true, exampleConfig));
});

test('shouldNotifyReadyForCommittee: too many successful daily tx', (t) => {
  const state = getExampleState();
  state.EthereumCommittedTxStats[getToday()] = exampleConfig.EthereumMaxCommittedDailyTx;
  state.VchainSyncStatus = 'in-sync';
  t.false(shouldNotifyReadyForCommittee(state, false, exampleConfig));
});

test('shouldCheckCanJoinCommittee: only when conditions are right', (t) => {
  const state = getExampleState();
  state.EthereumSyncStatus = 'operational';
  state.VchainSyncStatus = 'in-sync';
  state.ManagementInCommittee = false;

  t.true(shouldCheckCanJoinCommittee(state, exampleConfig));
  t.false(shouldCheckCanJoinCommittee(state, getAuditConfig()));

  state.EthereumSyncStatus = 'tx-pending';
  t.false(shouldCheckCanJoinCommittee(state, exampleConfig));
  state.EthereumSyncStatus = 'operational';
  t.true(shouldCheckCanJoinCommittee(state, exampleConfig));

  state.VchainSyncStatus = 'exist-not-in-sync';
  t.false(shouldCheckCanJoinCommittee(state, exampleConfig));
  state.VchainSyncStatus = 'in-sync';
  t.true(shouldCheckCanJoinCommittee(state, exampleConfig));

  state.ManagementInCommittee = true;
  t.false(shouldCheckCanJoinCommittee(state, exampleConfig));
  state.ManagementInCommittee = false;
  t.true(shouldCheckCanJoinCommittee(state, exampleConfig));
});
