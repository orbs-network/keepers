import * as Logger from '../logger';
import { State, CommitteeMember, VchainReputations } from './state';
import { getCurrentClockTime, getToday } from '../helpers';
import { calcMedianInPlace } from './helpers';

const INVALID_REPUTATION_THRESHOLD = 4;
const VALID_REPUTATION_THRESHOLD = 2;

export function getAllGuardiansToVoteUnready(state: State, config: VoteUnreadyParams): CommitteeMember[] {
  if (state.EthereumCommittedTxStats[getToday()] >= config.EthereumMaxCommittedDailyTx) return [];
  if (state.EthereumSyncStatus != 'operational') return [];
  if (state.VchainSyncStatus != 'in-sync') return [];
  if (!state.ManagementInCommittee) return [];
  return state.ManagementCurrentCommittee.filter((guardian) => shouldBeVotedUnready(guardian, state, config));
}

function shouldBeVotedUnready(guardian: CommitteeMember, state: State, config: VoteUnreadyParams): boolean {
  if (!noPendingVoteUnready(guardian.EthAddress, state, config)) return false;
  if (hasLongBadReputationInAnyVc(guardian.EthAddress, state, config)) return true;
  return false;
}

// helpers

export interface VoteUnreadyParams {
  InvalidReputationGraceSeconds: number;
  VoteUnreadyValiditySeconds: number;
  EthereumMaxCommittedDailyTx: number;
  VchainOutOfSyncThresholdSeconds: number;
}

function hasLongBadReputationInAnyVc(ethAddress: string, state: State, config: VoteUnreadyParams): boolean {
  const now = getCurrentClockTime();
  const orbsAddress = state.ManagementEthToOrbsAddress[ethAddress];
  if (!orbsAddress) return false;
  for (const [vcId, reputations] of Object.entries(state.VchainReputations)) {
    initTimeEnteredBadReputationIfNeeded(ethAddress, vcId, state);

    // if vc is out of sync, ignore its reputation altogether
    if (!isVcNear(vcId, state, config)) continue;

    // maintain a helper state variable to see how long they're in bad reputation
    if (isBadReputation(orbsAddress, reputations)) {
      if (state.TimeEnteredBadReputation[ethAddress][vcId] == 0) state.TimeEnteredBadReputation[ethAddress][vcId] = now;
    } else state.TimeEnteredBadReputation[ethAddress][vcId] = 0;

    // rely on the helper state variable to respond
    if (state.TimeEnteredBadReputation[ethAddress][vcId] == 0) continue;
    if (now - state.TimeEnteredBadReputation[ethAddress][vcId] > config.InvalidReputationGraceSeconds) {
      Logger.log(`Found orbs address ${orbsAddress} in vc ${vcId} with bad reputation for a long time!`);
      return true;
    }
  }

  return false;
}

function isBadReputation(orbsAddress: string, reputations: VchainReputations): boolean {
  const value = reputations[orbsAddress] ?? -1;
  if (value < 0) return false;
  if (value < INVALID_REPUTATION_THRESHOLD) return false;
  if (calcMedianInPlace(Object.values(reputations)) > VALID_REPUTATION_THRESHOLD) return false;
  return true;
}

function noPendingVoteUnready(ethAddress: string, state: State, config: VoteUnreadyParams): boolean {
  const nowEth = state.ManagementRefTime;
  const lastVoteUnready = state.EthereumLastVoteUnreadyTime[ethAddress] ?? 0;
  if (nowEth - lastVoteUnready > config.VoteUnreadyValiditySeconds) return true;
  const lastReadyForCommittee = state.ManagementOthersElectionsStatus[ethAddress]?.LastUpdateTime ?? 0;
  if (lastReadyForCommittee > lastVoteUnready) return true;
  return false;
}

function initTimeEnteredBadReputationIfNeeded(ethAddress: string, vcId: string, state: State) {
  if (!state.TimeEnteredBadReputation[ethAddress]) state.TimeEnteredBadReputation[ethAddress] = {};
  if (!state.TimeEnteredBadReputation[ethAddress][vcId]) state.TimeEnteredBadReputation[ethAddress][vcId] = 0;
}

function isVcNear(vcId: string, state: State, config: VoteUnreadyParams): boolean {
  if (!state.VchainMetrics[vcId]) return false;
  const lastBlockTime = state.VchainMetrics[vcId].LastBlockTime;
  const now = getCurrentClockTime();
  if (now - lastBlockTime > config.VchainOutOfSyncThresholdSeconds) return false;
  return true;
}
