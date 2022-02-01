import * as Logger from '../logger';
import { State, VchainReputations } from '../model/state';
import * as Orbs from 'orbs-client-sdk';
import { jsonStringifyComplexTypes, getCurrentClockTime } from '../helpers';

export async function readAllVchainReputations(endpointSchema: string, contractName: string, state: State) {
  let successful = 0;
  for (const [vcId] of Object.entries(state.ManagementVirtualChains)) {
    try {
      const client = getOrbsClient(vcId, endpointSchema, state);
      state.VchainReputations[vcId] = await fetchVchainReputations(client, contractName);
      successful++;
    } catch (err) {
      Logger.error(err.stack);
      state.VchainReputations[vcId] = {};
    }
  }

  // last to be after all possible exceptions and processing delays
  state.VchainReputationsLastPollTime = getCurrentClockTime();

  // log progress
  Logger.log(
    `Fetched vchain reputations, num vchains succeeded: ${successful}/${
      Object.keys(state.ManagementVirtualChains).length
    }.`
  );
}

// helpers

function getEndpoint(virtualChainId: string, endpointSchema: string) {
  return endpointSchema.replace(/{{ID}}/g, virtualChainId);
}

export function getOrbsClient(virtualChainId: string, endpointSchema: string, state: State) {
  // create client if needed (cached)
  if (!state.orbsClientPerVchain[virtualChainId]) {
    state.orbsClientPerVchain[virtualChainId] = new Orbs.Client(
      getEndpoint(virtualChainId, endpointSchema),
      parseInt(virtualChainId),
      Orbs.NetworkType.NETWORK_TYPE_MAIN_NET,
      new Orbs.LocalSigner(state.orbsAccount)
    );
  }
  return state.orbsClientPerVchain[virtualChainId];
}

async function fetchVchainReputations(client: Orbs.Client, contractName: string): Promise<VchainReputations> {
  const query = await client.createQuery(contractName, 'getAllCommitteeReputations', []);
  const response = await client.sendQuery(query);
  if (response.executionResult != Orbs.ExecutionResult.EXECUTION_RESULT_SUCCESS) {
    throw new Error(`Orbs reputations query failed: ${jsonStringifyComplexTypes(response)}.`);
  }
  const committeeAddresses = response.outputArguments[0].value as Uint8Array[];
  const committeeReputations = response.outputArguments[1].value as number[];
  if (committeeAddresses.length != committeeReputations.length) {
    throw new Error(
      `Orbs reputations results length mismatch: ${committeeAddresses.length} != ${committeeReputations.length}.`
    );
  }

  const res: { [OrbsAddress: string]: number } = {};
  for (let i = 0; i < committeeAddresses.length; i++) {
    const addressAsHex = Buffer.from(committeeAddresses[i]).toString('hex').toLowerCase();
    res[addressAsHex] = committeeReputations[i];
  }
  return res;
}
