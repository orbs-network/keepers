import test from 'ava';
import { State } from './state';
import { findEthFromOrbsAddress, calcMedianInPlace, weiToEth } from './helpers';

test('findEthFromOrbsAddress', (t) => {
  const state = new State();
  state.ManagementEthToOrbsAddress = {
    '29ce860a2247d97160d6dfc087a15f41e2349087': '16fcf728f8dc3f687132f2157d8379c021a08c12',
    e16e965a4cc3fcd597ecdb9cd9ab8f3e6a750ac9: '86544bdd6c8b957cd198252c45fa215fc3892126',
    '51baa09f2f7dfc7a0f65886b68720958d389cac7': '174dc3b45bdbbc32aa0b95e64d0247ce99b08f69',
  };
  t.is(
    findEthFromOrbsAddress('86544bdd6c8b957cd198252c45fa215fc3892126', state),
    'e16e965a4cc3fcd597ecdb9cd9ab8f3e6a750ac9'
  );
  t.is(
    findEthFromOrbsAddress('174dc3b45bdbbc32aa0b95e64d0247ce99b08f69', state),
    '51baa09f2f7dfc7a0f65886b68720958d389cac7'
  );
  t.falsy(findEthFromOrbsAddress('29ce860a2247d97160d6dfc087a15f41e2349087', state));
  t.falsy(findEthFromOrbsAddress('xyz', state));
});

test('calcMedianInPlace', (t) => {
  t.is(calcMedianInPlace([]), 0);
  t.is(calcMedianInPlace([1]), 1);
  t.is(calcMedianInPlace([2, 1]), 1.5);
  t.is(calcMedianInPlace([3, 1, 2]), 2);
  t.is(calcMedianInPlace([3, 1, 4, 2]), 2.5);
});

test('weiToEth', (t) => {
  t.is(weiToEth('100000000000000000'), '0.1');
  t.is(weiToEth('0'), '0');
  t.is(weiToEth('123432123432123432'), '0.123432');
  t.is(weiToEth('623597280544873'), '0.000623');
  t.is(weiToEth('6235972803'), '0');
  t.is(weiToEth('4000000000000000000000'), '4000');
});
