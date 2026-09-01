/**
 * Who a socket is.
 *
 * Identity here is per-room and disposable, which settles one of the deferred
 * decisions in `docs/multiplayer-contract.md`: there are no accounts, nothing is
 * persisted, and a `playerId` means nothing once its room is gone. A child types
 * a name and a code and is in.
 */

import { randomUUID } from 'node:crypto'

/** Short, readable in a log, and unique inside a room — which is as far as it needs to go. */
export function newPlayerId() {
    return `p-${randomUUID().slice(0, 8)}`
}

/**
 * The token that rebinds a dropped player to their own slot.
 *
 * Full-length and random because it is the *only* thing standing between a
 * reconnecting child and somebody else's hand: `room/join` with a token takes
 * over an existing slot rather than creating one. A guessable token would be a
 * way to steal a seat at a table.
 *
 * It lives in `sessionStorage` on the client, so it dies with the tab — which is
 * the right lifetime for something that only means anything while a room exists.
 */
export function newResumeToken() {
    return randomUUID()
}

/**
 * M0 issues the token and M0 honours it while the slot is still there; the 60s
 * grace that keeps a slot alive *after* a socket drops is M4, along with the
 * `paused` phase. Until then a reconnect works if you are quick and the room
 * has not swept you, which is enough to prove the token path is real.
 */
export const RESUME_GRACE_MS = 60000
