import Web3 from 'web3';
import { State } from '../model/state';

const HTTP_TIMEOUT_SEC = 20;

export async function initWeb3Client(ethereumEndpoint: string, state: State) {
  // init web3
  state.web3 = new Web3(
    new Web3.providers.HttpProvider(ethereumEndpoint, {
      keepAlive: true,
      timeout: HTTP_TIMEOUT_SEC * 1000,
    })
  );
  state.web3.eth.transactionBlockTimeout = 0; // to stop web3 from polling pending tx
  state.web3.eth.transactionPollingTimeout = 0; // to stop web3 from polling pending tx
  state.web3.eth.transactionConfirmationBlocks = 1; // to stop web3 from polling pending tx
  state.chainId = await state.web3.eth.getChainId();
}
