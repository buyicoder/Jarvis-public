# Migrating from repository-local memory

Jarvis never moves or deletes existing data automatically.

1. Choose an empty private target and run `jarvis vault plan --source <old> --target <new>`.
2. Review the generated copy-only plan.
3. Run `jarvis vault copy --plan <plan> --confirm-copy-only`.
4. Run `jarvis vault verify --plan <plan>` and retain its hash receipt.
5. Run `jarvis vault switch --plan <plan> --receipt <receipt>`.
6. Run `jarvis doctor --control-plane` and `jarvis vault status`.

The old location remains untouched. Clean it up only through a separate, deliberate user action after independent backup verification.
