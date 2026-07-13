# Public capability parity

This repository implements public-safe equivalents of every reusable Jarvis software capability reviewed from the private checkpoint. Parity means equivalent behavior and safety contracts, not copied personal state.

| Capability | Public implementation | Verification | Status |
| --- | --- | --- | --- |
| External Vault and lifecycle | capture → distill → proposal → approve → apply, with path/symlink/approval boundaries | lifecycle and CLI tests | Complete |
| Vault relocation | plan → copy-only → hash verify → explicit switch; no deletion | Vault tests and CLI smoke | Complete |
| Desktop workspace | sandboxed Electron window, loopback-only API, status and War Room | source and packaged-window smoke | Complete |
| Packaging privacy | schema allowlist, app/package assertions, source/app/tar scans | package and privacy tests | Complete |
| Canonical control state | SQLite migrations, reconcile, events, reports, artifacts, decisions, permissions, automations | control-plane tests and doctor | Complete |
| War Room | current unresolved reducer plus historical timeline | control-plane tests and UI smoke | Complete |
| Generic thread governance | onboarding, owner dispatch, immutable root assignment, idempotent roster reconcile | governance tests and CLI smoke | Complete |
| Durable reports | SHA-256 ingest, external artifact reference, receipt-backed finalize | governance/control tests | Complete |
| Model governance | deterministic recommendation-only route/explain/evaluate; strict max gate; no ultra automation | model fixtures and tests | Complete |
| Usage governance | local metered/cached token telemetry, explicitly not billing | model tests and CLI smoke | Complete |
| Optional provider | disabled by default; explicit URL/model/key configuration; controlled failure | provider tests | Complete |
| Optional activity evidence | disabled by default; explicit paths; aggregate domain/count/hour only | activity tests | Complete |
| Automation routing | recommends the current owner; does not execute cross-project work | activity/governance tests | Complete |
| Retrieval | local chunking, vector retrieval, BM25 fallback, RRF | retrieval tests | Complete |
| Research radar | public discovery, explicit network opt-in, partial-source evidence | radar tests and offline smoke | Complete |
| Codex integration | optional adapter, generic state classification, controlled unavailable state | governance/plugin tests | Complete |
| Skills and plugin | generic controller/owner/onboarding skills plus brief/risk/context/capture/handoff plugin | plugin tests and package scan | Complete |

## Deliberately excluded state

Private memory, runtime databases, ledgers, reports, screenshots, browser rows, server inventory, account identifiers, cookies, tokens, environment files, real thread records, and personal paths are data—not reusable software capability—and are never synchronized. A new clone starts empty and creates its own external Vault/runtime.

The machine-readable source is [`public-parity.json`](./public-parity.json).
