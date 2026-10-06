# Security

## CI trust boundary

CI runs for pushes to `main` and ordinary `pull_request` events targeting `main` in `pirabyte/erecht24-nuxt`. Fork PRs use GitHub's unprivileged `pull_request` context, which withholds repository and organization secrets and restricts the workflow token. The workflow never uses `pull_request_target`, comment commands, or artifacts from other workflows. Jobs use disposable GitHub-hosted runners, a read-only contents token, no stored Git credentials, and no shared dependency cache. Actions are pinned to reviewed full commit SHAs.

Repository settings require approval for every external fork contributor, require full SHA pins, allow only the two Action commits used by CI, and prevent the workflow token from approving pull requests. These settings are managed in GitHub, outside the workflow file. Review the entire proposed workflow and executable code before approving an external run. Approval permits untrusted code execution; it does not turn a fork PR into a trusted contribution. Do not add privileged pull request triggers or follow-up workflows that consume untrusted artifacts.

Do not add customer API keys, deployment credentials, or publishing tokens to the CI workflow. Dependency installation and tests execute code and must be treated accordingly. Treat PR titles, branch names, bodies, and other contributor input as untrusted; never interpolate them into shell commands. Review external contributions before merging them into `main`, especially changes to workflows, dependencies, install scripts, and tests.

A fork owner can modify and run their own copy of this public project. Their copy does not grant access to this repository's credentials. Public source, including the fixed plugin key, can be read by anyone. Customer project API keys must remain in private server runtime configuration.

## Reporting vulnerabilities

Report vulnerabilities privately through this repository's GitHub Security Advisories. Do not include customer keys or other credentials in public issues, pull requests, or CI logs.
