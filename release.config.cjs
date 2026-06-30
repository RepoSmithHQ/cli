/**
 * semantic-release configuration.
 *
 * Plugin order matters — each plugin transforms the release context and
 * the next one picks it up:
 *   1. commit-analyzer: scans commits since the last tag, decides the
 *      next semver bump from Conventional Commits.
 *   2. release-notes-generator: turns those commits into release notes.
 *   3. npm: bumps `version` in package.json and publishes to the npm
 *      registry. Authenticates via OIDC trusted publishing (no NPM_TOKEN).
 *   4. github: tags the release, creates/updates the GitHub Release,
 *      and comments on the issues/PRs that landed in the release.
 *   5. git: commits the version bump in package.json (and CHANGELOG.md
 *      if added later) back to the repo so the next run sees a consistent
 *      state.
 *
 * `branches: ['main']` keeps releases on the default branch only;
 * `repositoryUrl` is read from package.json.
 */
module.exports = {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/npm',
    '@semantic-release/github',
    [
      '@semantic-release/git',
      {
        assets: ['package.json'],
        message:
          'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ],
};