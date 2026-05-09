import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  rootDir: 'src',
  moduleNameMapper: {
    '^@kuros/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
    '^@kuros/shared/(.*)$': '<rootDir>/../../../packages/shared/src/$1',
  },
};

export default config;
