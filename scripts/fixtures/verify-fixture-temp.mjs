import os from 'node:os';
import { resolve } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';

const expected = process.env.EVZ_TEST_TEMP_EXPECTED;
if (!expected) throw new Error('The expected fixture temporary directory is required');
const tmpdir = os.tmpdir;
os.tmpdir = () => {
  const actual = tmpdir();
  if (resolve(actual) !== resolve(expected)) throw new Error('Fixture ignored the selected temporary directory');
  return actual;
};
syncBuiltinESMExports();
