# Jarvis

Jarvis is a local-first personal chief-of-staff: an external private Vault, a review-gated memory lifecycle, a canonical local control plane, and a sandboxed desktop War Room. This public repository contains the complete reusable software capability—not anyone's private state.

> **Developer Preview `1.0.0-preview.1`** — for Apple Silicon Macs running macOS 12 or newer. This preview is ad-hoc signed, not Developer ID signed or notarized, has no auto-update, and is not a stable release. Back up any data you choose to create.

See the [Developer Preview guide](docs/developer-preview.md) for download, checksum, install, Gatekeeper, data-location, uninstall, troubleshooting, and rollback instructions. Version-specific notes are in the [preview release record](docs/releases/v1.0.0-preview.1.md). Packaged artifacts belong on the [GitHub prerelease](https://github.com/buyicoder/Jarvis-public/releases/tag/v1.0.0-preview.1); source is available from the repository or the version tag.

## Quickstart

The source workflow requires Node.js 22.13 or newer. The packaged arm64 app does not require Node.js. No API key, Codex installation, browser access, or network connection is required for the local preview.

```bash
git clone https://github.com/buyicoder/Jarvis-public.git
cd Jarvis-public
npm install
npm run bootstrap
npm run doctor

# Optional: only on a new, empty Vault/runtime. Never overwrites existing state.
node bin/jarvis.mjs demo init --yes

node bin/jarvis.mjs capture "A reusable observation" --type learning
node bin/jarvis.mjs distill --write-proposal
node bin/jarvis.mjs proposal preview
node bin/jarvis.mjs proposal approve
node bin/jarvis.mjs apply --yes
```

For the source CLI, private data defaults to `~/.jarvis/vault` and operational state to `~/.jarvis/runtime`. The packaged desktop uses `~/Library/Application Support/Jarvis/vault` and `~/Library/Application Support/Jarvis/runtime`. A repository-local Vault is rejected unless `JARVIS_LEGACY_REPO_MEMORY=1` is explicitly set.

## Desktop

For the downloadable preview, verify its SHA256 checksum, open the DMG, and drag `Jarvis.app` to `/Applications`. Because this preview is not notarized, macOS may block a normal double-click; after verifying the checksum, Control-click the app in Finder and choose **Open**, then confirm **Open**. Do not disable Gatekeeper globally.

Source launch:

```bash
npm run desktop
```

The Electron window is sandboxed, uses context isolation, disables Node integration, and talks only to an ephemeral loopback service. Build and verify the macOS artifact locally with:

```bash
npm run release:gate:package
```

The gate tests a real packaged Electron window, performs a main interaction, saves evidence outside the repository, and scans packaged resources for forbidden state. It does not turn this ad-hoc-signed preview into a notarized release.

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
