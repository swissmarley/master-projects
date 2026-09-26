// Static configuration lives in app.json; this only lets CI stamp build numbers
// so every published build can be installed as an update of the previous one.
module.exports = ({ config }) => {
  const buildNumber = Number.parseInt(process.env.REPLAY_BUILD_NUMBER ?? '', 10);
  if (!Number.isInteger(buildNumber) || buildNumber < 1) return config;
  return {
    ...config,
    android: { ...config.android, versionCode: buildNumber },
    ios: { ...config.ios, buildNumber: String(buildNumber) },
  };
};
