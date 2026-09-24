# Releasing StreamerJS

Releases are automated with [changesets](https://changesets.dev) and published
to npm from GitHub Actions using
[trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token
is stored anywhere in this repository.

## Describing a change

Any pull request that changes what users get should carry a changeset. Run:

```bash
npm run changeset
```

Pick `patch`, `minor` or `major`, write a one line summary, and commit the file
it creates in `.changeset/`. The summary becomes the `CHANGELOG.md` entry, so
write it for someone upgrading.

Pull requests that only touch things users never see, such as CI configuration,
do not need one.

## How a release happens

1. A pull request with a changeset is merged into `main`.
2. The `Release` workflow opens a pull request titled **Version packages**. It
   bumps the version in `package.json`, updates `package-lock.json`, deletes the
   changeset files and writes `CHANGELOG.md`.
3. Merging that pull request runs the workflow again, which publishes to npm and
   pushes the git tag.

The Version packages pull request shows no checks, because pull requests opened
with the automatic `GITHUB_TOKEN` do not trigger workflows. The checks still run
on `main` before anything is published, and the release stops if they fail.

Several merges can accumulate before you release: the Version packages pull
request is updated in place and collects all pending changesets, so you release
when you merge it, not when you merge a feature.

## One time npm setup

Trusted publishing has to be enabled on npm once, by hand, by someone who can
administer the package. Until it is, the publish step fails to authenticate.

1. Sign in at [npmjs.com](https://www.npmjs.com/) as a user who can administer
   `@streamerjs/streamerjs`.
2. Open the package page and go to **Settings**.
3. Find the **Trusted Publisher** section and choose **GitHub Actions**.
4. Fill in:
   - **Organization or user**: `sergeychernyshev`
   - **Repository**: `streamerjs`
   - **Workflow filename**: `release.yml`
   - **Environment name**: leave empty
5. Save.

That is the whole setup. npm now accepts a publish from this repository's
`release.yml`, and only from there.

## Repository settings the release depends on

**Settings → Actions → General → Workflow permissions** has _Allow GitHub
Actions to create and approve pull requests_ turned on. Without it the release
run fails at the last step, after pushing `changeset-release/main`, with
`GitHub Actions is not permitted to create or approve pull requests`.

That setting also lets any workflow here approve a pull request, so `main` is
protected to make such an approval worthless:

- Changes to `main` go through a pull request approved by a code owner.
  `.github/CODEOWNERS` names the maintainers, and a bot can never be one, so a
  workflow's approval does not satisfy the rule.
- Direct pushes, force pushes and branch deletion are blocked.
- Release tags cannot be deleted or moved once pushed.
- Repository administrators can bypass the review, which is what makes a single
  maintainer workflow possible at all, since GitHub does not let anyone approve
  their own pull request.

Do not add **required status checks** to `main`. The Version packages pull
request is created with the automatic `GITHUB_TOKEN`, which never triggers
workflows, so a required check would never run and that pull request could never
be merged. Give the action a fine grained token or a GitHub App token first if
you want checks there.

### After the first successful release

- Revoke any npm automation tokens that were used to publish by hand, they are
  no longer needed.
- Optionally set **Publishing access** to _Require two factor authentication and
  disallow tokens_, which turns off token based publishing entirely.

### Things that will break it

- **Renaming or moving `.github/workflows/release.yml`.** npm matches the
  filename exactly. Update the trusted publisher settings in the same change.
- **Self hosted runners.** Only GitHub hosted runners can mint an OIDC token npm
  accepts.
- **Making the repository or the package private.** Publishing still works, but
  npm stops attaching provenance automatically.

Provenance needs no flag. npm attaches it by itself when a public package is
published from a public repository through trusted publishing.

## Publishing by hand

If the workflow is broken and a release cannot wait:

```bash
npm run version-packages   # bump version, changelog and lockfile
git commit -am "Version packages"
npm run npm-publish        # needs an npm token or an interactive login
```

Push the commit afterwards so `main` matches what is on npm.

## If a publish fails to authenticate

Check, in this order:

1. The trusted publisher settings on npm match `sergeychernyshev/streamerjs` and
   `release.yml` exactly.
2. The `release` job still has `id-token: write` permission.
3. The workflow's npm is 11.5.1 or newer, which the `Update npm` step ensures.

There is a known npm bug where publishing a **scoped** package over OIDC can
fail with a 404 ([npm/cli#8976](https://github.com/npm/cli/issues/8976)). The
usual fix is `"access": "public"` in `.changeset/config.json`, which this
repository already sets. If it still happens, fall back to a token: add an npm
automation token as an `NPM_TOKEN` repository secret and set `registry-url` plus
`NODE_AUTH_TOKEN` on the publish step.

## Tightening permissions later

This workflow uses the single `changesets/action` step, which means the whole
release job holds `id-token: write`. Changesets also ships separate
`select-mode`, `version`, `pack` and `publish` sub actions, which let the OIDC
permission sit only on the job that publishes. Worth doing if more people gain
write access to this repository.
