# Releasing

CI and versioning are wired so `main` can be a fully protected branch, **without storing any
secrets or tokens**. This is the key difference from a naive changesets setup that pushes the
version-bump commit straight to the default branch (forcing you to leave it unprotected).

## How it works

- **[`ci.yml`](../.github/workflows/ci.yml)** runs build, lint, and test on every pull request and
  on pushes to `main`, plus a check that each PR carries a changeset.
- **[`release.yml`](../.github/workflows/release.yml)** runs [`changesets/action`](https://github.com/changesets/action)
  on pushes to `main`. When changesets are pending it opens/updates a **"Version Packages" PR**
  (versions + changelogs on its own branch — nothing is pushed to `main`). It uses only the built-in
  `GITHUB_TOKEN`; there is no publish step and no npm token.

`main` is never written to directly. Version bumps arrive through a PR like any other change.

## Cutting a release

1. Land changes with a changeset: `yarn changeset` (pick packages + bump level).
2. Merge to `main` → the **Version Packages** PR appears.
3. **Admin-merge the Version Packages PR.** Its contents are generated (version bumps + changelog),
   and because the built-in `GITHUB_TOKEN` opened it, CI does not run on it — so merge it with admin
   privileges. This is the one manual concession of the token-free setup.
4. **Publish from your machine** (versions are now updated on `main`):
   ```bash
   git pull
   yarn install
   yarn build
   yarn changeset publish   # uses your local `npm login`; no CI token
   git push --follow-tags
   ```

`@traffic-cop/router` is private and excluded from publishing (see `.changeset/config.json`).

## Branch protection (Settings → Branches → rule for `main`)

- Require a pull request before merging.
- Require status checks: **`ci`** (and optionally **`changeset`**).
- Do **not** allow direct pushes.
- Leave admin bypass available (or use "merge without waiting for requirements" as an admin) so you
  can merge the Version Packages PR, which by design has no CI run.

## If you later want automated npm publishing (still token-free)

npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC) lets GitHub Actions
publish without a stored token: configure this repo + the release workflow as a trusted publisher in
each package's npm settings, then add a publish step with `permissions: id-token: write` and
`--provenance`. No secret is stored in GitHub.
