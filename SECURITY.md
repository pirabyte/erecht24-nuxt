# Security

## CI trust boundary

CI runs only for pushes to `main` in `pirabyte/erecht24-nuxt`. It does not run pull request code, use `pull_request_target`, accept comment commands, or download artifacts from other workflows. Jobs use disposable GitHub-hosted runners, a read-only contents token, no stored Git credentials, and no shared dependency cache. Actions are pinned to reviewed full commit SHAs.

Repository settings require approval for every external fork contributor, require full SHA pins, allow only the two Action commits used by CI, and prevent the workflow token from approving pull requests. These settings are managed in GitHub, outside the workflow file. Do not approve external workflow runs or add privileged pull request triggers without reviewing their execution path.

Do not add customer API keys, deployment credentials, or publishing tokens to the CI workflow. Dependency installation and tests execute code and must be treated accordingly. Review external contributions before merging them into `main`, especially changes to workflows, dependencies, install scripts, and tests.

A fork owner can modify and run their own copy of this public project. Their copy does not grant access to this repository's credentials. Public source, including the fixed plugin key, can be read by anyone. Customer project API keys must remain in private server runtime configuration.

## Reporting vulnerabilities

Report vulnerabilities privately through this repository's GitHub Security Advisories. Do not include customer keys or other credentials in public issues, pull requests, or CI logs.
