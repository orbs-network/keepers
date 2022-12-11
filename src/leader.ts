import _ from 'lodash';
import { fetchManagementStatus } from "./read/management";
import { findEthFromOrbsAddress } from './model/helpers';
import { getCurrentClockTime } from './helpers';
// import { sleep } from './helpers';
// import * as Logger from './logger';
// import urlExist from 'url-exist';


// export async function waitForEndpoint(endpoint: string, secs: number): Promise<Boolean> {
//     Logger.log(`watitng for ${endpoint} for ${secs} seconds`);

//     for (let i = 0; i < secs; i++) {
//         Logger.log(`call urlExist Attempt #${i}`)
//         const exists = await urlExist(endpoint);
//         if (exists)
//             return true;

//         Logger.log(`sleep 1 sec`);
//         await sleep(1000);
//     }
//     return false
// }
export async function readManagementStatus2(endpoint: string, myOrbsAddress: string, state: any): Promise<Boolean> {
    const url = `${endpoint}/status`;
    const response = await fetchManagementStatus(url);

    state.status.ManagementRefTime = response.Payload.CurrentRefTime;
    state.status.ManagementEthRefBlock = response.Payload.CurrentRefBlock;
    //status.ManagementVirtualChains = response.Payload.CurrentVirtualChains;
    // no need state.status.ManagementCurrentCommittee = response.Payload.CurrentCommittee;
    //status.ManagementCurrentStandbys = _.filter(response.Payload.CurrentCandidates, (node) => node.IsStandby);
    //status.ManagementCurrentTopology = response.Payload.CurrentTopology;
    state.status.ManagementEthToOrbsAddress = _.mapValues(response.Payload.Guardians, (node) => node.OrbsAddress);
    //status.ManagementOrbs2Name = _.mapValues(response.Payload.Guardians, (node) => node.Name);

    state.status.myEthAddress = findEthFromOrbsAddress(myOrbsAddress, state.status);
    state.status.myNode = response.Payload.Guardians[state.status.myEthAddress];

    state.status.ManagementInCommittee = response.Payload.CurrentCommittee.some((node) => node.EthAddress == state.status.myEthAddress);
    // doesnt need to be in status
    delete state.status.ManagementEthToOrbsAddress;

    // last to be after all possible exceptions and processing delays
    state.status.ManagementLastPollTime = getCurrentClockTime();
    state.management = response;
    return true;
}

// export function setLeaderStatus(committee: Array<any>, status: any) {
//     if (!committee.length) {
//         return console.error('comittee is not valid');
//     }
//     const dt = new Date();
//     const hour = dt.getUTCHours();
//     const day = dt.getUTCDate();
//     const year = dt.getUTCFullYear();
//     const utcTime = hour + day + year;
//     status.leaderIndex = utcTime % committee.length;
//     status.leaderName = committee[status.leaderIndex].Name;
// }
