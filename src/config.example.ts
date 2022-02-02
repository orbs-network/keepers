import { Configuration } from './config';

export const exampleConfig: Configuration = {
  ManagementServiceEndpoint: 'http://management-service:8080',
  EthereumEndpoint: 'http://ganache:7545',
  SignerEndpoint: 'http://signer:7777',
  NodeOrbsAddress: '11f4d0a3c12e86b4b5f39b213f7e19d048276dae',
  StatusJsonPath: './status/status.json',
  RunLoopPollTimeSeconds: 1,
  EthereumDiscountGasPriceFactor: 1,
  BIUrl: ''
};
