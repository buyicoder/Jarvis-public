---
name: jarvis-thread-onboarding-gate
description: Validate a generic long-lived Jarvis role assignment before dispatch.
---

# Jarvis Thread Onboarding Gate

Check the live title, permission profile, approval policy, project, and archived/replaced state. Prompt text is not permission. Continue only when title and permission checks pass; otherwise return a machine-readable blocking reason and do not execute.

Use `jarvis threads onboarding --title ... --expected-title ... --permission-profile ... --approval-policy ...`.
