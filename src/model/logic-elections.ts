import { State } from './state';
import * as Logger from '../logger';
import { getToday, getCurrentClockTime } from '../helpers';
import { findEthFromOrbsAddress } from './helpers';
import { Configuration } from '../config';

const MAX_STANDBYS = 5; // in future, can be taken from the MaxStandbysChanged event

export function shouldNotifyReadyToSync(state: State, config: EthereumElectionsParams): boolean {
  if (state.EthereumCommittedTxStats[getToday()] >= config.EthereumMaxCommittedDailyTx) return false;
  if (state.EthereumSyncStatus != 'operational') return false;

  if (
    !(state.ManagementIsStandby || state.ManagementInCommittee) && // we only refresh standby nodes that are in-sync
    (isMyUpdateStale(state, config) || isStandbyAvailable(state)) &&
    state.VchainSyncStatus == 'exist-not-in-sync'
  ) {
    Logger.log(
      `shouldNotifyReadyToSync because node is deployed, not in topology and does not have a non-stale RTS in place.`
    );
    return true;
  }

  if (
    config.ElectionsAuditOnly &&
    state.ManagementIsStandby &&
    isMyUpdateStale(state, config) &&
    state.VchainSyncStatus == 'in-sync'
  ) {
    Logger.log(
      `shouldNotifyReadyToSync because audit only node, in sync that want to keep its position in the standby.`
    );
    return true;
  }

  return false;
}

export function shouldNotifyReadyForCommittee(
  state: State,
  ethereumCanJoinCommittee: boolean,
  config: EthereumElectionsParams
): boolean {
  if (state.EthereumCommittedTxStats[getToday()] >= config.EthereumMaxCommittedDailyTx) return false;
  if (state.EthereumSyncStatus != 'operational') return false;
  if (config.ElectionsAuditOnly) return false;
  if (state.VchainSyncStatus != 'in-sync') return false;

  if (
    !state.ManagementInCommittee &&
    (!state.ManagementMyElectionsStatus || state.ManagementMyElectionsStatus.ReadyForCommittee == false)
  ) {
    Logger.log(
      `shouldNotifyReadyForCommittee because node that the world thinks is not ready for committee, and is now ready.`
    );
    return true;
  }

  if (
    state.ManagementIsStandby &&
    state.ManagementMyElectionsStatus &&
    state.ManagementMyElectionsStatus.ReadyForCommittee == true &&
    (isMyUpdateStale(state, config) || ethereumCanJoinCommittee)
  ) {
    Logger.log(
      `shouldNotifyReadyForCommittee because consensus node refresh - in standby, in sync and stale or can join ${ethereumCanJoinCommittee}.`
    );
    return true;
  }

  return false;
}

export function shouldCheckCanJoinCommittee(state: State, config: EthereumElectionsParams): boolean {
  if (state.EthereumSyncStatus != 'operational') return false;
  if (config.ElectionsAuditOnly) return false;
  if (state.VchainSyncStatus != 'in-sync') return false;
  if (state.ManagementInCommittee) return false;
  return true;
}

// lower bound on time duration -> not opting for vc stuck and resulting in lazy "vcs in sync"
export function calcTimeEnteredTopology(state: State, config: Configuration): number {
  const myEthAddress = findEthFromOrbsAddress(config.NodeOrbsAddress, state);
  if (state.ManagementCurrentTopology.some((node) => node.EthAddress == myEthAddress)) {
    if (state.TimeEnteredTopology == -1) return getCurrentClockTime();
    else return state.TimeEnteredTopology;
  }
  return -1;
}

// helpers

export interface EthereumElectionsParams {
  ElectionsRefreshWindowSeconds: number;
  ElectionsAuditOnly: boolean;
  EthereumMaxCommittedDailyTx: number;
}

function isMyUpdateStale(state: State, config: EthereumElectionsParams): boolean {
  if (!state.ManagementMyElectionsStatus) return true;
  if (state.ManagementMyElectionsStatus.ReadyToSync != true) return true; // TODO: verify with odedw
  if (state.ManagementMyElectionsStatus.TimeToStale < config.ElectionsRefreshWindowSeconds) return true;
  return false;
}

function isStandbyAvailable(state: State): boolean {
  // no enough standbys
  if (state.ManagementCurrentStandbys.length < MAX_STANDBYS) return true;
  // or one of the standbys is stale
  for (const node of state.ManagementCurrentStandbys) {
    const timeToStale = state.ManagementOthersElectionsStatus[node.EthAddress]?.TimeToStale ?? 0;
    if (timeToStale <= 0) return true;
  }
  return false;
}
