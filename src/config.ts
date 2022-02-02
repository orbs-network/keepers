export interface Configuration {
  ManagementServiceEndpoint: string; // does not have default
  EthereumEndpoint: string; // does not have default
  SignerEndpoint: string; // does not have default
  EthereumDiscountGasPriceFactor: number;
  StatusJsonPath: string;
  NodeOrbsAddress: string;
  BIUrl: string;
  RunLoopPollTimeSeconds: number;
}

export const defaultConfiguration = {
  StatusJsonPath: './status/status.json',
  VirtualChainEndpointSchema: 'http://chain-{{ID}}:8080',
  RunLoopPollTimeSeconds: 240 * 60,
  OrbsReputationsContract: '_Committee',
  VchainUptimeRequiredSeconds: 5,
  VchainSyncThresholdSeconds: 5 * 60,
  VchainOutOfSyncThresholdSeconds: 60 * 60,
  VchainStuckThresholdSeconds: 2 * 60 * 60,
  EthereumBalancePollTimeSeconds: 4 * 60 * 60,
  EthereumCanJoinCommitteePollTimeSeconds: 10 * 60,
  EthereumSyncRequirementSeconds: 20 * 60,
  FailToSyncVcsTimeoutSeconds: 24 * 60 * 60,
  ElectionsRefreshWindowSeconds: 2 * 60 * 60,
  InvalidReputationGraceSeconds: 30 * 60 * 60,
  VoteUnreadyValiditySeconds: 7 * 24 * 60 * 60,
  ElectionsAuditOnly: false,
  SuspendVoteUnready: true,
  EthereumDiscountGasPriceFactor: 0.75,
  EthereumDiscountTxTimeoutSeconds: 60 * 60,
  EthereumNonDiscountTxTimeoutSeconds: 10 * 60,
  EthereumMaxGasPrice: 500000000000, // 500 gwei
  EthereumMaxCommittedDailyTx: 4,
};

export function validateConfiguration(config: Configuration) {
  if (!config.ManagementServiceEndpoint) {
    throw new Error(`ManagementServiceEndpoint is empty in config.`);
  }
  if (!config.EthereumEndpoint) {
    throw new Error(`EthereumEndpoint is empty in config.`);
  }
  if (!config.SignerEndpoint) {
    throw new Error(`SignerEndpoint is empty in config.`);
  }

  if (!config.NodeOrbsAddress) {
    throw new Error(`NodeOrbsAddress is empty in config.`);
  }
  if (config.NodeOrbsAddress.startsWith('0x')) {
    throw new Error(`NodeOrbsAddress must not start with "0x".`);
  }
  if (config.NodeOrbsAddress.length != '11f4d0a3c12e86b4b5f39b213f7e19d048276dae'.length) {
    throw new Error(`NodeOrbsAddress has incorrect length: ${config.NodeOrbsAddress.length}.`);
  }
  if (!config.StatusJsonPath) {
    throw new Error(`StatusJsonPath is empty in config.`);
  }
  if (!config.RunLoopPollTimeSeconds) {
    throw new Error(`RunLoopPollTimeSeconds is empty or zero.`);
  }
  if (typeof config.RunLoopPollTimeSeconds != 'number') {
    throw new Error(`RunLoopPollTimeSeconds is not a number.`);
  }

  if (!config.EthereumDiscountGasPriceFactor) {
    throw new Error(`EthereumDiscountGasPriceFactor is empty or zero.`);
  }
  if (typeof config.EthereumDiscountGasPriceFactor != 'number') {
    throw new Error(`EthereumDiscountGasPriceFactor is not a number.`);
  }
}
