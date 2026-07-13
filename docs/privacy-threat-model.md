# Privacy threat model

## Protected assets

- personal memory, decisions, relationships, daily logs, captures, and proposals
- credentials, cookies, account identifiers, environment configuration, and server inventory
- browser rows, workstation activity, real thread/session records, reports, screenshots, and databases

## Publication controls

The repository, staged index, no-`.git` clone, npm tarball, and packaged app are scanned independently. Path rules reject private memory and runtime locations. Content rules reject personal absolute paths, credential-shaped values, private keys, private network endpoints, and identity-shaped records. The package allowlist admits schemas but not memory instances.

## Runtime controls

- External Vault and runtime are default; repository-local memory requires an explicit legacy flag.
- Core memory changes require an approved proposal plus `apply --yes`.
- Activity is off by default and stores aggregate domain/count/hour evidence only.
- The desktop API is loopback-only.
- Provider, Codex, and research integrations fail safely when absent or disabled.
- Model routing is metadata only and never mutates model/provider configuration.

## Residual responsibility

Users must not add private files to the repository or embed secrets in configuration examples. Run `npm run release:check` before sharing source and `npm run release:gate:package` before sharing a desktop artifact.
