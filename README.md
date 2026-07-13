# Jarvis

Jarvis is a local-first personal chief-of-staff: an external private Vault, a review-gated memory lifecycle, a canonical local control plane, and a sandboxed desktop War Room. This public repository contains the complete reusable software capability—not anyone's private state.

## Quickstart

Requirements: Node.js 22.13 or newer. No API key, Codex installation, browser access, or network connection is required.

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

Private data defaults to `~/.jarvis/vault`; operational state defaults to `~/.jarvis/runtime`. A repository-local Vault is rejected unless `JARVIS_LEGACY_REPO_MEMORY=1` is explicitly set.

## Desktop

```bash
npm run desktop
```

The Electron window is sandboxed, uses context isolation, disables Node integration, and talks only to an ephemeral loopback service. Build and verify the macOS artifact locally with:

```bash
npm run release:gate:package
```

The gate tests a real packaged Electron window, performs a main interaction, saves evidence outside the repository, and scans packaged resources for forbidden state.

## Capability map

- Memory: capture → deterministic distill → proposal → approval → explicit apply.
- Vault: copy-only plan, hash verification, and explicit switch with no automatic deletion.
- Control plane: local SQLite migrations, events, reports/artifacts, decisions, permissions, automations, reconcile, doctor, backup, and restore.
- War Room: current unresolved projection plus historical timeline.
- Governance: generic onboarding/owner dispatch, immutable root assignment, idempotent roster reconciliation, and receipt-backed reports.
- Models: deterministic recommendation-only routing, explain/audit fixtures, strict max requirements, ultra prohibition, sanitized shadow logs, and local token telemetry labeled “not billing”.
- Optional adapters: provider, Codex state, browser activity, automation, and research network access are independently disabled by default.
- Retrieval: SCAR-style chunking, local vector search, BM25 fallback, reciprocal-rank fusion, and opt-in multi-source radar.
- Integration: portable Jarvis skills and a local Codex plugin for brief, risk, safe context, capture, and handoff.

Run `node bin/jarvis.mjs help` for the machine-readable command list.

## Privacy defaults

- Only code, tests, docs, plugin/skills, and sanitized schemas belong in Git or packages.
- Captures, daily notes, identity, projects, decisions, reports, databases, evidence, and indexes remain external.
- Activity collection is off by default. When explicitly enabled with paths supplied by the user, only aggregate domain/count/hour evidence is retained.
- Research radar never uses the network without `--network`.
- Provider and Codex adapters return controlled unavailable states when unconfigured.
- Core memory never changes from capture alone; approval and `apply --yes` are both required.

See the [architecture](docs/architecture.md), [privacy threat model](docs/privacy-threat-model.md), [migration guide](docs/migration.md), and [capability parity matrix](docs/public-parity.md).

## Development

```bash
npm test
npm run privacy:scan
npm run release:check
git diff --check
```

The scanner covers the Git index/worktree, no-`.git` directories, npm tarballs, and packaged app resources. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
