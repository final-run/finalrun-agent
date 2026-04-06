# Project-Specific Sync Scripts

Scripts in this directory run during `fab sync` after the kit-level sync operations.

## Naming Convention

- Use numbered `*.sh` files: `1-first.sh`, `2-second.sh`, etc.
- Scripts execute in sorted order.
- Each script should be idempotent (safe to re-run).
