# Releasing

The `publish.yml` workflow publishes stable `vX.Y.Z` tags from commits already merged into `main`. The tag must match `package.json`. It builds, tests, audits runtime dependencies, and checks the release tarball in a job with read-only permissions. A separate job publishes that tarball with OIDC and provenance, without installing project dependencies or executing package scripts. Release jobs use Node.js 24 and require npm 11.5.1 or newer.

For the initial package creation, a maintainer may need to publish once locally with `npm publish --access public`. Then configure an npm trusted publisher in the package settings:

- Organization: `pirabyte`
- Repository: `erecht24-nuxt`
- Workflow filename: `publish.yml`
- Environment: leave empty
- Allowed actions: enable direct publishing with `npm publish`

No npm token is needed in GitHub secrets. Follow the [npm trusted publishing instructions](https://docs.npmjs.com/trusted-publishers/) to create the mapping. Configure repository rules to restrict release-tag creation to maintainers.

For subsequent releases, update the version and lockfile in a reviewed pull request, merge it, and tag that exact merged commit:

```sh
git tag vX.Y.Z <merged-commit>
git push origin vX.Y.Z
```

Verify the publish workflow and registry version before creating the GitHub release. Tags on an unmerged feature branch fail the release check.
