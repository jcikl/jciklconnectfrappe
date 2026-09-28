module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.js'],
  // A cold transform cache can push the first render of a suite past Jest's 5s default.
  testTimeout: 30000,
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|nativewind|react-native-css-interop|react-native-safe-area-context)',
  ],
};
