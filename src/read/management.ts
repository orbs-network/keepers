import _ from 'lodash';
import * as Logger from '../logger';
import { State } from '../model/state';
import fetch from 'node-fetch';
import { Decoder, decodeString, num, object, record, bool, str, array, maybe } from 'ts-json-decode';
import { getCurrentClockTime } from '../helpers';
import { findEthFromOrbsAddress } from '../model/helpers';

export async function readManagementStatus(endpoint: string, myOrbsAddress: string, state: State) {
  const url = `${endpoint}/status`;
  const response = await fetchManagementStatus(url);

  state.ManagementRefTime = response.Payload.CurrentRefTime;
  state.ManagementEthRefBlock = response.Payload.CurrentRefBlock;
  state.ManagementVirtualChains = response.Payload.CurrentVirtualChains;
  state.ManagementCurrentCommittee = response.Payload.CurrentCommittee;
  state.ManagementCurrentStandbys = _.filter(response.Payload.CurrentCandidates, (node) => node.IsStandby);
  state.ManagementCurrentTopology = response.Payload.CurrentTopology;
  state.ManagementEthToOrbsAddress = _.mapValues(response.Payload.Guardians, (node) => node.OrbsAddress);

  const myEthAddress = findEthFromOrbsAddress(myOrbsAddress, state);
  state.ManagementInCommittee = response.Payload.CurrentCommittee.some((node) => node.EthAddress == myEthAddress);
  state.ManagementIsStandby = state.ManagementCurrentStandbys.some((node) => node.EthAddress == myEthAddress);
  state.ManagementMyElectionsStatus = response.Payload.Guardians[myEthAddress]?.ElectionsStatus;
  state.ManagementOthersElectionsStatus = _.mapValues(response.Payload.Guardians, (node) => node.ElectionsStatus);
  delete state.ManagementOthersElectionsStatus[myEthAddress];

  // last to be after all possible exceptions and processing delays
  state.ManagementLastPollTime = getCurrentClockTime();

  // log progress
  Logger.log(`Fetched management service, num vchains: ${Object.keys(state.ManagementVirtualChains).length}.`);
}

// helpers

export async function fetchManagementStatus(url: string): Promise<ManagementStatusResponse> {
  const res = await fetch(url);
  const body = await res.text();
  try {
    return decodeString(managementStatusResponseDecoder, body);
  } catch (err) {
    Logger.error(err.message);
    throw new Error(`Invalid ManagementStatus response (HTTP-${res.status}):\n${body}`);
  }
}

interface ManagementStatusResponse {
  Payload: {
    CurrentRefTime: number;
    CurrentRefBlock: number;
    CurrentCommittee: { EthAddress: string; Weight: number }[];
    CurrentCandidates: { EthAddress: string; IsStandby: boolean }[];
    CurrentTopology: { EthAddress: string }[];
    Guardians: {
      [EthAddress: string]: {
        OrbsAddress: string;
        ElectionsStatus?: {
          LastUpdateTime: number;
          ReadyToSync: boolean;
          ReadyForCommittee: boolean;
          TimeToStale: number;
        };
      };
    };
    CurrentVirtualChains: {
      [VirtualChainId: string]: {
        Expiration: number;
        RolloutGroup: string;
        IdentityType: number;
        Tier: string;
        GenesisRefTime: number;
      };
    };
  };
}

const managementStatusResponseDecoder: Decoder<ManagementStatusResponse> = object({
  Payload: object({
    CurrentRefTime: num,
    CurrentRefBlock: num,
    CurrentCommittee: array(
      object({
        EthAddress: str,
        Weight: num,
      })
    ),
    CurrentCandidates: array(
      object({
        EthAddress: str,
        IsStandby: bool,
      })
    ),
    CurrentTopology: array(
      object({
        EthAddress: str,
      })
    ),
    Guardians: record(
      object({
        OrbsAddress: str,
        ElectionsStatus: maybe(
          object({
            LastUpdateTime: num,
            ReadyToSync: bool,
            ReadyForCommittee: bool,
            TimeToStale: num,
          })
        ),
      })
    ),
    CurrentVirtualChains: record(
      object({
        Expiration: num,
        RolloutGroup: str,
        IdentityType: num,
        Tier: str,
        GenesisRefTime: num,
      })
    ),
  }),
});
