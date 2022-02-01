
import { State } from './state';

// return empty string if not found
export function findEthFromOrbsAddress(orbsAddress: string, state: State): string {
  for (const [eth, orbs] of Object.entries(state.ManagementEthToOrbsAddress)) {
    console.log(orbsAddress, orbs)
    if (orbsAddress.toLowerCase() == orbs.toLowerCase()) {
      return eth.toLowerCase();
    }
  }
  return '';
}

export function calcMedianInPlace(values: number[]): number {
  if (values.length == 0) return 0;
  values.sort((a, b) => a - b);
  const half = Math.floor(values.length / 2);
  if (values.length % 2) return values[half];
  return (values[half - 1] + values[half]) / 2.0;
}

// returns 0.123456 ETH (6 digits accuracy like etherscan)
export function weiToEth(wei: string): string {
  const num = Number(BigInt(wei) / BigInt('1000000000000'));
  return (num / 1000000).toString();
}
