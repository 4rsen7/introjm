# Local Debug Scripts

Use this folder for one-off local debug scripts that help investigate issues without polluting the repo root.

Rules:
- Put ad-hoc scripts here, not in the repository root.
- Files in this folder are gitignored by default.
- Keep only this `README.md` tracked in git.
- If a script becomes useful for the team long-term, move it into a real tracked script under `scripts/` and document it properly.

Good examples for this folder:
- PDF export investigation scripts
- one-off Playwright smoke checks
- temporary API probes
- migration verification helpers

Suggested naming:
- `check-pdf-export.mjs`
- `trace-interview-upload.mjs`
- `verify-metrics-sync.mjs`

Example run pattern:

```bash
node scripts/local-debug/check-pdf-export.mjs
```

If a script needs secrets:
- read them from existing local env files
- never hardcode private keys in the script
- keep the script local unless it is generalized and safe to commit
