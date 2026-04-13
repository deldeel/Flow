// Expo (Metro) config
// 解决 Web 导出时 expo-sqlite 依赖的 .wasm 资源无法被打包的问题
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];

module.exports = config;

