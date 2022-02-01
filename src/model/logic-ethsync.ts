import * as Logger from '../logger';
import { EthereumSyncStatusEnum, State } from './state';
import { getCurrentClockTime } from '../helpers';

export function calcEthereumSyncStatus(state: State, config: EthereumSyncStatusParams): EthereumSyncStatusEnum {
  if (state.EthereumSyncStatus == 'need-reset') return 'need-reset'; // stuck until node reset
  if (!isEthValid(state, config)) return 'out-of-sync';
  if (isAnyTxReverted(state)) return 'need-reset';
  if (isNewlyVotedUnready(state)) return 'need-reset';
  if (isFailedToSyncVcs(state, config)) return 'need-reset';
  if (isAnyTxPending(state)) return 'tx-pending';
  return 'operational';
}

// helpers

export interface EthereumSyncStatusParams {
  EthereumSyncRequirementSeconds: number;
  FailToSyncVcsTimeoutSeconds: number;
}

function isEthValid(state: State, config: EthereumSyncStatusParams): boolean {
  const now = getCurrentClockTime();
  if (now - state.ManagementRefTime > config.EthereumSyncRequirementSeconds) return false;
  return true;
}

function isNewlyVotedUnready(state: State): boolean {
  if (!state.ManagementMyElectionsStatus) return false;
  if (state.ManagementMyElectionsStatus.ReadyToSync != false) return false;
  if (state.ServiceLaunchTime > state.ManagementMyElectionsStatus.LastUpdateTime) return false;
  Logger.error(`Found that we have been newly voted unready since RTS is false, reset needed!`);
  return true;
}

function isFailedToSyncVcs(state: State, config: EthereumSyncStatusParams): boolean {
  const now = getCurrentClockTime();

  // maintain a helper state variable to see how long we're in failed to sync
  if (state.ManagementIsStandby && state.VchainSyncStatus != 'in-sync') {
    if (state.TimeEnteredStandbyWithoutVcSync == 0) state.TimeEnteredStandbyWithoutVcSync = now;
  } else state.TimeEnteredStandbyWithoutVcSync = 0;

  // rely on the helper state variable to respond
  if (state.TimeEnteredStandbyWithoutVcSync == 0) return false;
  if (now - state.TimeEnteredStandbyWithoutVcSync > config.FailToSyncVcsTimeoutSeconds) {
    Logger.error(`We're standby but can't sync vcs since ${state.TimeEnteredStandbyWithoutVcSync}, reset needed!`);
    return true;
  }
  return false;
}

function isAnyTxReverted(state: State): boolean {
  if (state.EthereumLastElectionsTx?.Status === 'revert') {
    Logger.error(`Found an elections tx ${state.EthereumLastElectionsTx.TxHash} that is reverted, reset needed!`);
    return true;
  }
  if (state.EthereumLastVoteUnreadyTx?.Status === 'revert') {
    Logger.error(`Found a vote unready tx ${state.EthereumLastVoteUnreadyTx.TxHash} that is reverted, reset needed!`);
    return true;
  }
  return false;
}

function isAnyTxPending(state: State): boolean {
  if (state.EthereumLastElectionsTx?.Status === 'pending') return true;
  if (state.EthereumLastVoteUnreadyTx?.Status === 'pending') return true;
  return false;
}
