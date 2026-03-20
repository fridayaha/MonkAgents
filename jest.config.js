/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@monkagents/shared$': '<rootDir>/packages/shared/src',
  },
  testMatch: ['**/*.spec.ts'],
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  rootDir: '.',
  projects: [
    '<rootDir>/packages/shared/jest.config.js',
    '<rootDir>/packages/backend/jest.config.js',
  ],
};