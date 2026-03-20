// Custom Jest resolver to work around jest-resolve/unrs-resolver issues on Node < 18.
// jest 30 uses unrs-resolver via @oxc-project internals, which can fail to resolve
// local file paths and package names without special conditions on Node 16.
// This resolver falls back to require.resolve when the default fails.

module.exports = (request, options) => {
  try {
    return options.defaultResolver(request, options);
  } catch (_err) {
    // Fall back to Node's built-in require.resolve
    try {
      return require.resolve(request, { paths: [options.basedir || process.cwd()] });
    } catch (resolveErr) {
      throw resolveErr;
    }
  }
};
