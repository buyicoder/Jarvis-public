# Jarvis Developer Preview

This guide covers `1.0.0-preview.1`, an early local-only preview for Apple Silicon (`arm64`) Macs running macOS 12 or newer. It is not a stable release, is ad-hoc signed rather than Developer ID signed, is not notarized, and has no auto-update.

## Choose a path

### Download the packaged app

Download the arm64 DMG or ZIP and `SHA256SUMS` from the [`v1.0.0-preview.1` GitHub prerelease](https://github.com/buyicoder/Jarvis-public/releases/tag/v1.0.0-preview.1). If that prerelease is not present, no packaged preview has been published yet; use the source path instead. Put all three downloaded files in one directory and verify them before opening:

```bash
cd ~/Downloads
shasum -a 256 -c SHA256SUMS
```

Both archives must report `OK`. Do not install an artifact whose checksum or source release cannot be verified.

Open the DMG, drag `Jarvis.app` to `/Applications`, eject the image, and launch Jarvis. The packaged app includes its runtime; Node.js is not required.

### Run from source

Source development requires Node.js 22.13 or newer. Clone the repository for current development, or download the immutable tagged source archive from `https://github.com/buyicoder/Jarvis-public/archive/refs/tags/v1.0.0-preview.1.zip` after the tag is published:

```bash
git clone https://github.com/buyicoder/Jarvis-public.git
cd Jarvis-public
npm install
npm run bootstrap
npm run doctor
npm run desktop
```

No API key, Codex installation, browser permission, or network access is required for the default local workspace.

## First launch and synthetic demo

Jarvis starts empty and does not import personal data. To populate a new workspace with clearly marked synthetic records, explicitly opt in:

```bash
node bin/jarvis.mjs demo init --yes
```

The demo refuses to run when the Vault or control state already contains user data. Re-running a completed demo is idempotent; it does not overwrite existing content. Never point a demo command at a valuable Vault without first checking `node bin/jarvis.mjs demo status`.

The packaged workspace exposes the same opt-in demo from its empty-state experience. Demo content is labeled synthetic and remains local.

## Where data lives

| Install path | Private Vault | Operational state |
| --- | --- | --- |
| Packaged desktop | `~/Library/Application Support/Jarvis/vault` | `~/Library/Application Support/Jarvis/runtime` |
| Source CLI | `~/.jarvis/vault` | `~/.jarvis/runtime` |

Environment variables such as `JARVIS_VAULT_DIR`, `JARVIS_MEMORY_DIR`, `JARVIS_RUNTIME_DIR`, and `JARVIS_HOME` can select explicit external locations. Repository-local memory is rejected unless `JARVIS_LEGACY_REPO_MEMORY=1` is deliberately enabled.

Back up the Vault before upgrades or rollback. Runtime state can be reconstructed, but the Vault contains the records you chose to create.

## Gatekeeper

This preview is ad-hoc signed and not notarized. After verifying the SHA256 checksum, use the supported per-app Finder flow:

1. In Finder, open `/Applications`.
2. Control-click `Jarvis.app` and choose **Open**.
3. Confirm **Open** in the warning dialog.

Do not disable Gatekeeper globally. If Finder still reports that the app is damaged or cannot be verified, delete that copy, download it again from the documented prerelease, verify the checksum, and retry. Treat a checksum mismatch as a hard stop.

## Uninstall and data preservation

Quit Jarvis and move `/Applications/Jarvis.app` to the Trash. This removes the application but intentionally preserves the Vault and runtime folders listed above.

To remove data too, first back up anything you want to keep, verify the backup independently, and then delete the relevant Jarvis data directory manually. Jarvis never deletes or migrates an existing Vault automatically. Source users may also remove the cloned repository; doing so does not remove the default external Vault.

## Troubleshooting

- **Blank or failed launch:** quit Jarvis, reopen it once, then run the source workflow's `npm run doctor` if you are developing from a clone.
- **Gatekeeper warning:** verify the checksum and use Finder's Control-click **Open** flow; never turn off Gatekeeper globally.
- **No demo appears:** confirm the workspace is empty and use the explicit synthetic-demo command or empty-state action.
- **Data is not where expected:** check whether you launched the packaged app or source CLI and use the table above; also inspect any `JARVIS_*` path overrides.
- **Optional integration unavailable:** this is expected until that adapter is explicitly enabled and configured.

## Rollback

Quit Jarvis, remove the preview app, and reinstall the previous known-good artifact if one exists. Preserve the Vault. Do not replace or delete it during rollback. There is no in-app downgrade or automatic update mechanism in this preview.
