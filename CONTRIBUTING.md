# Contributing

Use Node.js 22.13 or newer. Keep software in the repository and fixtures synthetic; keep all user state external.

Before opening a change:

```bash
npm test
npm run privacy:scan
npm run release:check
git diff --check
```

Never commit a Vault, runtime database, report, screenshot, environment file, credential, real account/thread record, workstation path, or browser history. Add characterization tests for behavior changes. Security and privacy degradations must fail closed and produce a controlled, actionable message.
