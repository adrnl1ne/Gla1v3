# Agent Features Roadmap (concise)

Purpose: prioritized features and recommended first-steps for implementation.

## Phase 1 — Core (high priority)
- File operations: upload/download/list
- Process management: list/kill/start
- Enhanced system enumeration
- Improve task reliability & retries

## Phase 2 — Stealth & protocols
- Beacon jitter and randomized intervals
- Additional protocols: WebSocket, HTTPS, DNS fallback
- Improved logging controls and persistence encryption

## Phase 3 — Optional / Red-team (requires policy review)
- Persistence modules (OS-specific)
- Network pivoting / port forwarding
- Screenshots, optional screenshot capture

## Security & ethics
- Features requiring elevated access must be gated and documented
- Add CI checks and usage warnings for potentially destructive features

---
*Draft — trimmed and aligned with `docs/` style.*