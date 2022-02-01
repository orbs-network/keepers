import * as Orbs from 'orbs-client-sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { jsonStringifyComplexTypes } from '../../src/helpers';

export class GammaDriver {
  public ownerAccount: Orbs.Account;
  public client: Orbs.Client;

  async init(endpoint: string, virtualChainId: number) {
    // create client
    this.ownerAccount = Orbs.createAccount();
    this.client = new Orbs.Client(
      endpoint,
      virtualChainId,
      Orbs.NetworkType.NETWORK_TYPE_TEST_NET,
      new Orbs.LocalSigner(this.ownerAccount)
    );

    // deploy contracts
    const source = readFileSync(join(__dirname, 'reputation_contract.go'));
    const [deploymentTx, deploymentTxId] = await this.client.createDeployTransaction(
      'MockCommittee',
      Orbs.PROCESSOR_TYPE_NATIVE,
      source
    );
    const response = await this.client.sendTransaction(deploymentTx);
    if (response.executionResult != Orbs.ExecutionResult.EXECUTION_RESULT_SUCCESS) {
      throw new Error(`GammaDriver contract deployment failed: ${jsonStringifyComplexTypes(response)}.`);
    }
    return this;
  }

  // async incrementCounter() {
  //   const [tx, txId] = await this.client.createTransaction('Counter', 'inc', []);
  //   const response = await this.client.sendTransaction(tx);
  //   if (response.executionResult != Orbs.ExecutionResult.EXECUTION_RESULT_SUCCESS) {
  //     throw new Error(`GammaDriver increment transaction failed: ${jsonStringifyComplexTypes(response)}.`);
  //   }
  // }
}
