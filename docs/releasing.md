# Releasing

CI and releases are wired so `main` can be a fully protected branch. This is the key difference
from a naive changesets setup that pushes the version-bump commit straight to the default branch
(which forces you to leave it unprotected).

## How it works

- **[`ci.yml`](../.github/workflows/ci.yml)** runs build, lint, and test on every pull request and
  on pushes to `main`, plus a check that each PR carries a changeset.
- **[`release.yml`](../.github/workflows/release.yml)** runs [`changesets/action`](https://github.com/changesets/action)
  on pushes to `main`:
  - with pending changesets, it opens/updates a **"Version Packages" PR** (versions + changelogs on
    its own branch — nothing is pushed to `main`);
  - once that PR is merged and no changesets remain, it **publishes to npm and pushes tags**.

`main` is never written to directly. Version bumps arrive through a PR like any other change; the
only direct push is git tags, which branch protection does not govern.

## One-time setup

### 1. Secrets (repo → Settings → Secrets and variables → Actions)

- **`NPM_TOKEN`** — an npm **automation** token with publish access to the `@traffic-cop` scope.
  (The scope must exist on npm first.)
- **`RELEASE_GITHUB_TOKEN`** — a token used by `changesets/action` **instead of** the default
  `GITHUB_TOKEN`, so the Version PR it opens triggers CI and can satisfy required checks. Either:
  - a **fine-grained PAT** on this repo with `Contents: Read and write` and `Pull requests: Read and
    write`, or
  - a **GitHub App** installation token (preferred for shared/org repos).

  Without this, the Version PR is opened by `GITHUB_TOKEN`, CI does not run on it, and required
  checks can never pass.

### 2. Branch protection (Settings → Branches → add rule for `main`)

- Require a pull request before merging.
- Require status checks to pass — select the **`ci`** check.
- (Optional) Require the **`changeset`** check.
- Do **not** allow direct pushes; the release flow never needs them.

Tags are not covered by branch protection, so the publish step's tag push works. If you later add
**tag** protection rules, grant the `RELEASE_GITHUB_TOKEN`'s identity a bypass.

## Cutting a release

1. Land changes with a changeset: `yarn changeset` (pick packages + bump level).
2. Merge to `main` → the **Version Packages** PR appears.
3. Merge the Version Packages PR → packages publish to npm and tags are pushed.

`@traffic-cop/router` is private and excluded from publishing (see `.changeset/config.json`).
