import * as Logger from '../logger';
import { State } from '../model/state';
import { writeFileSync } from 'fs';
import { ensureFileDirectoryExists, JsonResponse, getCurrentClockTime, getTenDayPeriod } from '../helpers';
import { Configuration } from '../config';
import { weiToEth } from '../model/helpers';

const MINIMUM_ALLOWED_ETH_BALANCE_WEI = BigInt('100000000000000000'); // 0.1 ETH
const MAX_ALLOWED_FEE_PER_TEN_DAYS_ETH = 0.1;
const TX_CONSECUTIVE_TIMEOUTS = 10;
const TX_SEND_FAILURE_TIMEOUT = 24 * 60 * 60; // seconds

export function writeStatusToDisk(filePath: string, state: State, config: Configuration, err?: Error) {
  const status: JsonResponse = {
    Status: getStatusText(state),
    Timestamp: new Date().toISOString(),
    Payload: {
      Uptime: getCurrentClockTime() - state.ServiceLaunchTime,
      MemoryUsage: process.memoryUsage(),
      Version: {
        Semantic: state.CurrentVersion,
      },
      EthereumSyncStatus: state.EthereumSyncStatus,
      VchainSyncStatus: state.VchainSyncStatus,
      EthereumBalanceLastPollTime: state.EthereumBalanceLastPollTime,
      EtherBalance: state.EtherBalance,
      EthereumCanJoinCommitteeLastPollTime: state.EthereumCanJoinCommitteeLastPollTime,
      EthereumConsecutiveTxTimeouts: state.EthereumConsecutiveTxTimeouts,
      EthereumLastElectionsTx: state.EthereumLastElectionsTx,
      EthereumLastVoteUnreadyTx: state.EthereumLastVoteUnreadyTx,
      EthereumLastVoteUnreadyTime: state.EthereumLastVoteUnreadyTime,
      EthereumCommittedTxStats: state.EthereumCommittedTxStats,
      EthereumFeesStats: state.EthereumFeesStats,
      VchainReputationsLastPollTime: state.VchainReputationsLastPollTime,
      VchainReputations: state.VchainReputations,
      VchainMetricsLastPollTime: state.VchainMetricsLastPollTime,
      VchainMetrics: state.VchainMetrics,
      ManagementLastPollTime: state.ManagementLastPollTime,
      ManagementEthRefBlock: state.ManagementEthRefBlock,
      ManagementInCommittee: state.ManagementInCommittee,
      ManagementIsStandby: state.ManagementIsStandby,
      ManagementMyElectionStatus: state.ManagementMyElectionsStatus,
      TimeEnteredStandbyWithoutVcSync: state.TimeEnteredStandbyWithoutVcSync,
      TimeEnteredBadReputation: state.TimeEnteredBadReputation,
      TimeEnteredTopology: state.TimeEnteredTopology,
      Config: config,
    },
  };

  // include error field if found errors
  const errorText = getErrorText(state, err);
  if (errorText) {
    status.Error = errorText;
  }

  // do the actual writing to local file
  ensureFileDirectoryExists(filePath);
  const content = JSON.stringify(status, null, 2);
  writeFileSync(filePath, content);

  // log progress
  Logger.log(`Wrote status JSON to ${filePath} (${content.length} bytes).`);
}

// helpers

function getStatusText(state: State) {
  const res = [];
  res.push();
  res.push(`EthSyncStatus = ${state.EthereumSyncStatus}`);
  res.push(`VcSyncStatus = ${state.VchainSyncStatus}`);
  res.push(`EtherBalance = ${weiToEth(state.EtherBalance)} ETH`);
  const tenDays = getTenDayPeriod();
  res.push(`TxFeesIn10Days = ${(state.EthereumFeesStats[tenDays] ?? 0).toFixed(6)} ETH`);
  return res.join(', ');
}

function getErrorText(state: State, err?: Error) {
  const res = [];
  if (state.EthereumSyncStatus == 'need-reset') {
    res.push(`Service requires reset.`);
  }
  if (BigInt(state.EtherBalance) < MINIMUM_ALLOWED_ETH_BALANCE_WEI) {
    res.push(
      `Eth balance below ${weiToEth(MINIMUM_ALLOWED_ETH_BALANCE_WEI.toString(10))}: ${weiToEth(
        state.EtherBalance
      )} ETH.`
    );
  }
  if (state.EthereumSyncStatus == 'out-of-sync') {
    res.push(`Eth is out of sync.`);
  }
  if (state.EthereumConsecutiveTxTimeouts > TX_CONSECUTIVE_TIMEOUTS) {
    res.push(`Too many pending tx timeouts: ${state.EthereumConsecutiveTxTimeouts}.`);
  }
  const tenDays = getTenDayPeriod();
  if ((state.EthereumFeesStats[tenDays] ?? 0) > MAX_ALLOWED_FEE_PER_TEN_DAYS_ETH) {
    res.push(
      `Tx fees in 10 days above ${MAX_ALLOWED_FEE_PER_TEN_DAYS_ETH}: ${(state.EthereumFeesStats[tenDays] ?? 0).toFixed(
        6
      )} ETH.`
    );
  }
  const electionsTxFailedAgo = getCurrentClockTime() - (state.EthereumLastElectionsTx?.SendTime ?? 0);
  if (state.EthereumLastElectionsTx?.Status == 'failed-send' && electionsTxFailedAgo < TX_SEND_FAILURE_TIMEOUT) {
    res.push(`Elections tx failed ${electionsTxFailedAgo} seconds ago.`);
  }
  const voteUnreadyTxFailedAgo = getCurrentClockTime() - (state.EthereumLastVoteUnreadyTx?.SendTime ?? 0);
  if (state.EthereumLastVoteUnreadyTx?.Status == 'failed-send' && voteUnreadyTxFailedAgo < TX_SEND_FAILURE_TIMEOUT) {
    res.push(`vote unready tx failed ${voteUnreadyTxFailedAgo} seconds ago.`);
  }
  if (err) {
    res.push(`Error: ${err.message}.`);
  }
  return res.join(' ');
}
