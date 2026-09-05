# Releasing

CI and versioning are wired so `main` can be a fully protected branch, **without storing any
secrets or tokens**. This is the key difference from a naive changesets setup that pushes the
version-bump commit straight to the default branch (forcing you to leave it unprotected).

## How it works

- **[`ci.yml`](../.github/workflows/ci.yml)** runs build, lint, and test on every pull request and
  on pushes to `main`, plus a check that each PR carries a changeset.
- **[`release.yml`](../.github/workflows/release.yml)** runs [`changesets/action`](https://github.com/changesets/action)
  on pushes to `main`:
  - with pending changesets, it opens/updates a **"Version Packages" PR** (versions + changelogs on
    its own branch — nothing is pushed to `main`);
  - once that PR is merged and no changesets remain, it **publishes to npm via OIDC and pushes tags**.

  It uses only the built-in `GITHUB_TOKEN`; npm auth is [trusted publishing](https://docs.npmjs.com/trusted-publishers)
  (OIDC), so **no secret or token is stored anywhere**.

`main` is never written to directly. Version bumps arrive through a PR; the only direct push is git
tags, which branch protection does not govern.

## One-time setup per package (the OIDC bootstrap)

npm cannot attach a trusted publisher to a package that does not exist yet, so the **first** publish
of each new package is manual; every publish after that is automatic via OIDC.

For each publishable package (`@traffic-cop/api`, `@traffic-cop/pulumi`):

1. Publish it once from your machine with your own `npm login` (no token stored in CI):
   ```bash
   yarn build
   yarn workspace @traffic-cop/api npm publish --access public
   ```
2. On npmjs.com → the package → **Settings → Trusted Publisher**, add: this repository and the
   workflow file `release.yml`. (The `@traffic-cop` scope must exist first.)

After that, CI publishes new versions via OIDC with no further manual steps.

## Cutting a release

1. Land changes with a changeset: `yarn changeset` (pick packages + bump level).
2. Merge to `main` → the **Version Packages** PR appears.
3. **Admin-merge the Version Packages PR.** Its contents are generated (version bumps + changelog),
   and because the built-in `GITHUB_TOKEN` opened it, CI does not run on it — so merge it with admin
   privileges. This is the one manual concession of the token-free setup.
4. On merge, the release workflow publishes the bumped packages via OIDC and pushes their tags.

`@traffic-cop/router` is private and excluded from publishing (see `.changeset/config.json`).

## Branch protection (Settings → Branches → rule for `main`)

- Require a pull request before merging.
- Require status checks: **`ci`** (and optionally **`changeset`**).
- Do **not** allow direct pushes.
- Leave admin bypass available (or use "merge without waiting for requirements" as an admin) so you
  can merge the Version Packages PR, which by design has no CI run.
