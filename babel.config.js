module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // react-native-reanimated 4 在 SDK 54 上需要 react-native-worklets/plugin。
      // 必须放在 plugins 列表的最后一位。
      'react-native-worklets/plugin',
    ],
  };
};
