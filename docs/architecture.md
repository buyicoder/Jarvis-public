# Architecture

Jarvis separates publishable software from private state.

```text
public repository                  external user state
├── CLI and desktop               ├── Vault documents
├── control/reducer code          ├── runtime/control.db
├── sanitized schemas             ├── vector index
├── generic skills/plugin         ├── reports/evidence
└── tests and docs                └── opt-in local activity summary
```

The CLI and Electron shell share one configuration resolver. Unless `JARVIS_LEGACY_REPO_MEMORY=1` is explicitly set, a Vault inside the repository is rejected. Runtime databases and evidence are outside the repository too.

`control.db` is the canonical operational store. Append-only events feed a reducer whose current projection contains unresolved state; resolved and superseded records remain in the timeline. Reconciliation is idempotent, and the root assignment cannot be silently replaced.

The desktop binds an ephemeral loopback port and loads a sandboxed Electron window with context isolation and no Node integration. Packaging copies only source assets and sanitized schemas; it does not copy a user Vault or runtime.

Optional adapters are fail-closed. Provider calls, Codex state access, activity collection, and research network access require separate explicit opt-ins.
