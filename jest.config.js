export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  moduleFileExtensions: ['js', 'jsx'],
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/test/**/*.test.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/data/**',
    '!src/scripts/injected-script.js'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
    '^@modules/(.*)$': '<rootDir>/src/scripts/modules/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@script-utils/(.*)$': '<rootDir>/src/scripts/utils/$1'
  }
};
