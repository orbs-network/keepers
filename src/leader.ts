import _ from 'lodash';
import { fetchManagementStatus } from "./read/management";
import { findEthFromOrbsAddress } from './model/helpers';
import { getCurrentClockTime } from './helpers';

export async function readManagementStatus2(endpoint: string, myOrbsAddress: string, status: any): Promise<any> {
    const url = `${endpoint}/status`;
    const response = await fetchManagementStatus(url);

    status.ManagementRefTime = response.Payload.CurrentRefTime;
    status.ManagementEthRefBlock = response.Payload.CurrentRefBlock;
    //status.ManagementVirtualChains = response.Payload.CurrentVirtualChains;
    status.ManagementCurrentCommittee = response.Payload.CurrentCommittee;
    //status.ManagementCurrentStandbys = _.filter(response.Payload.CurrentCandidates, (node) => node.IsStandby);
    //status.ManagementCurrentTopology = response.Payload.CurrentTopology;
    status.ManagementEthToOrbsAddress = _.mapValues(response.Payload.Guardians, (node) => node.OrbsAddress);
    //status.ManagementOrbs2Name = _.mapValues(response.Payload.Guardians, (node) => node.Name);

    status.myEthAddress = findEthFromOrbsAddress(myOrbsAddress, status);
    status.myNode = response.Payload.Guardians[status.myEthAddress];

    status.ManagementInCommittee = response.Payload.CurrentCommittee.some((node) => node.EthAddress == status.myEthAddress);
    // doesnt need to be in status
    delete status.ManagementEthToOrbsAddress;

    // last to be after all possible exceptions and processing delays
    status.ManagementLastPollTime = getCurrentClockTime();
    return response;
}

export function setLeaderStatus(committee: Array<any>, status: any) {
    if (!committee.length) {
        return console.error('comittee is not valid');
    }
    const dt = new Date();
    const hour = dt.getUTCHours();
    const day = dt.getUTCDate();
    const year = dt.getUTCFullYear();
    const utcTime = hour + day + year;
    status.leaderIndex = utcTime % committee.length;
    status.leaderName = committee[status.leaderIndex].Name;
}