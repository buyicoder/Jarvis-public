# Jarvis

Jarvis is a local-first personal chief-of-staff. It captures daily input, turns reviewed material into proposals, and writes durable memory only after explicit approval.

The repository contains code and sanitized schemas. Personal data belongs in an external Vault, which defaults to `~/.jarvis/vault`.

## Quickstart

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/buyicoder/Jarvis-public.git
cd Jarvis-public
npm install
npm run bootstrap
npm run doctor

node bin/jarvis.mjs capture "A reusable observation" --type learning
node bin/jarvis.mjs distill --write-proposal
node bin/jarvis.mjs proposal preview
node bin/jarvis.mjs proposal approve
node bin/jarvis.mjs apply --yes
```

`distill` is deterministic and offline in this public release. It creates a reviewable proposal from today's captures; it does not call a paid model or write long-term memory directly.

## Privacy model

- Code, tests, and schemas live in the repository.
- Captures, daily notes, proposals, projects, identity, and decisions live in the external Vault.
- `jarvis apply` previews by default. A proposal must be approved, followed by `apply --yes`, before it can change memory.
- Proposal targets are constrained to the configured Vault; traversal and absolute targets are rejected.
- No API key is required for bootstrap, doctor, capture, distill, proposal, apply, morning, or routing.
- `JARVIS_LEGACY_REPO_MEMORY=1` is an explicit compatibility escape hatch. Do not use it in a clone you intend to publish.

To choose another private location:

```bash
export JARVIS_VAULT_DIR=/path/to/private/vault
npm run bootstrap
```

## Commands

| Command | Purpose |
| --- | --- |
| `jarvis init` | Create the external Vault and copy sanitized schemas |
| `jarvis doctor` | Check the memory boundary and Vault availability |
| `jarvis capture` | Save raw input without changing core memory |
| `jarvis distill [--write-proposal]` | Classify today's captures and optionally create a proposal |
| `jarvis proposal preview` | Inspect the latest pending proposal |
| `jarvis proposal approve` | Explicitly approve the latest proposal |
| `jarvis apply [--yes]` | Preview by default; apply an approved proposal only with `--yes` |
| `jarvis morning` | Show today's risk-reduction question and recent daily evidence |
| `jarvis route` | Return recommendation-only model tier metadata |

The existing SCAR-inspired chunking, local BM25 fallback, vector search, GitHub bootstrap, and multi-source research radar remain available. GitHub repository scanning is explicit and requires `GITHUB_USERNAME`; first download the local embedding model with `npm run model:download`, then run `npm run bootstrap:github`.

## Model governor

`jarvis route --complexity 4 --risk high --budget normal` returns deterministic JSON with `mode: recommendation_only`. It never edits provider configuration, changes a running task, or selects an ultra/max tier.

## Development and release checks

```bash
npm test
npm run privacy:scan
```

The privacy scanner checks tracked text for absolute user paths, credential-like assignments, private-key material, local server addresses, and control database references. The [public parity matrix](docs/public-parity.md) records what was ported, generalized, kept private, or deferred.

## Migration from repository-local memory

1. Set `JARVIS_VAULT_DIR` to an empty private directory and run `npm run bootstrap`.
2. Review your old files manually; do not copy generated databases, logs, credentials, or reports.
3. Copy only memory documents you intentionally want in the Vault.
4. Keep the repository's `memory/` directory limited to `_schemas` and placeholder files.

Jarvis does not automatically migrate or delete existing files.

## Architecture

```text
repository (public)                    external Vault (private)
├── bin/                               ├── captures/
├── scripts/                           ├── proposals/
├── memory/_schemas/                   ├── daily/
├── docs/                              └── core/
└── test/
```

See [public-parity.json](docs/public-parity.json) for a machine-readable capability boundary.

## License

MIT
