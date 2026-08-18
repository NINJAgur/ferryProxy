module.exports = {
  preset: "jest-expo",
  passWithNoTests: true,
  moduleNameMapper: {
    "^@react-native-async-storage/async-storage$":
      "<rootDir>/node_modules/@react-native-async-storage/async-storage/jest/async-storage-mock.js",
    "^@react-native-community/netinfo$":
      "<rootDir>/node_modules/@react-native-community/netinfo/jest/netinfo-mock.js",
  },
};
