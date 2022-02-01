import test from 'ava';
import _ from 'lodash';
import { validateConfiguration, Configuration } from './config';
import { exampleConfig } from './config.example';

test('validateConfiguration works on valid config', (t) => {
  t.notThrows(() => validateConfiguration(exampleConfig));
});

for (const configKeyName in exampleConfig) {
  test.serial(`validateConfiguration fails on missing ${configKeyName}`, (t) => {
    const partialConfig = _.cloneDeep(exampleConfig);
    delete partialConfig[configKeyName as keyof Configuration];
    t.throws(() => validateConfiguration(partialConfig));
  });
}

test('validateConfiguration fails on invalid EthereumElectionsContract', (t) => {
  const invalidConfig = _.cloneDeep(exampleConfig);
  invalidConfig.EthereumElectionsContract = 'hello world';
  t.throws(() => validateConfiguration(invalidConfig));
});

test('validateConfiguration fails on invalid NodeOrbsAddress', (t) => {
  const invalidConfig = _.cloneDeep(exampleConfig);
  invalidConfig.NodeOrbsAddress = 'hello world';
  t.throws(() => validateConfiguration(invalidConfig));
  invalidConfig.NodeOrbsAddress = '0x11f4d0a3c12e86b4b5f39b213f7e19d048276dae'; // should not start with "0x"
  t.throws(() => validateConfiguration(invalidConfig));
});

test('validateConfiguration fails when string given instead of number', (t) => {
  const invalidConfig = JSON.parse(JSON.stringify(exampleConfig));
  invalidConfig.RunLoopPollTimeSeconds = '99'; // as string
  t.throws(() => validateConfiguration(invalidConfig));
});
