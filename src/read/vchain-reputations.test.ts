import test from 'ava';
import { State } from '../model/state';
import { getOrbsClient, readAllVchainReputations } from './vchain-reputations';
import * as Orbs from 'orbs-client-sdk';
import { jsonStringifyComplexTypes, getCurrentClockTime } from '../helpers';

const exampleVchainEndpointSchema = 'http://chain-{{ID}}:8080';

function getExampleState() {
  const exampleState = new State();
  exampleState.ManagementVirtualChains['1000000'] = {
    Expiration: 1592400011,
    GenesisRefTime: 1592400010,
    IdentityType: 0,
    RolloutGroup: 'main',
    Tier: 'defaultTier',
  };
  exampleState.ManagementVirtualChains['1000001'] = {
    Expiration: 1592400021,
    GenesisRefTime: 1592400020,
    IdentityType: 0,
    RolloutGroup: 'canary',
    Tier: 'defaultTier',
  };
  return exampleState;
}

test('gets Orbs client', (t) => {
  const state = getExampleState();
  getOrbsClient('1000000', exampleVchainEndpointSchema, state);
  t.assert(state.orbsClientPerVchain['1000000']);
});

function getMockOrbsClient(result = Orbs.ExecutionResult.EXECUTION_RESULT_SUCCESS) {
  return {
    createQuery: () => null,
    sendQuery: () => {
      return {
        executionResult: result,
        outputArguments: [{ value: [new Uint8Array([1, 2, 3])] }, { value: [17] }],
      };
    },
  };
}

test('reads data from valid VchainReputations', async (t) => {
  const state = getExampleState();
  state.orbsClientPerVchain['1000000'] = (getMockOrbsClient() as unknown) as Orbs.Client;
  state.orbsClientPerVchain['1000001'] = (getMockOrbsClient() as unknown) as Orbs.Client;
  await readAllVchainReputations(exampleVchainEndpointSchema, 'bla', state);

  t.log('state:', jsonStringifyComplexTypes(state));

  t.assert(getCurrentClockTime() - state.VchainReputationsLastPollTime < 5);
  for (const vcId of ['1000000', '1000001']) {
    t.is(state.VchainReputations[vcId]['010203'], 17);
  }
});

test('invalid VchainReputations response from first vchain', async (t) => {
  const state = getExampleState();
  state.orbsClientPerVchain['1000000'] = (getMockOrbsClient(
    Orbs.ExecutionResult.EXECUTION_RESULT_ERROR_UNEXPECTED
  ) as unknown) as Orbs.Client;
  state.orbsClientPerVchain['1000001'] = (getMockOrbsClient() as unknown) as Orbs.Client;
  await readAllVchainReputations(exampleVchainEndpointSchema, 'bla', state);

  t.log('state:', jsonStringifyComplexTypes(state));

  t.assert(getCurrentClockTime() - state.VchainReputationsLastPollTime < 5);
  t.is(state.VchainReputations['1000001']['010203'], 17);
  t.deepEqual(state.VchainReputations['1000000'], {});
});
