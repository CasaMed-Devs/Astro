// On EAS, google-services.json is gitignored and therefore not uploaded, so it
// is supplied as a file environment variable (GOOGLE_SERVICES_JSON). Locally the
// path from app.json is used.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
});
