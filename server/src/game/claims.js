/**
 * Claim resolution — the only contested resource in the game, and therefore the
 * only thing that genuinely has to be decided in one place.
 *
 * The item state machine, server-side only:
 *
 *     traveling -> claiming(playerId) -> served | wasted -> removed
 *
 * `claiming` is set and resolved inside the same call rather than being left to
 * linger a tick. The client is free to start its reach animation the moment it
 * sends; what it must not do is own the outcome.
 */

import { CLAIM_COOLDOWN_MS } from './config.js'
import { classifyGrab, dealHand } from './dealer.js'
import { releaseReservation } from './belts.js'

/**
 * Resolve one claim against the current state.
 *
 * Returns an error code for the claiming player, or `null` when the claim was
 * resolved (whether the tray was the right one or not — a wrong grab is a legal
 * move with a cost, not a protocol error).
 */
export function resolveClaim(state, cursor, { playerId, itemId }, events) {
    const player = state.players[playerId]
    if (!player) return 'INVALID_ACTION'

    const item = state.items[itemId]

    // Gone means gone, whether it was incinerated, already grabbed, or is
    // mid-resolution behind an earlier claim in this same tick.
    if (!item || item.state !== 'traveling') return 'ITEM_GONE'

    if (state.elapsedMs < player.cooldownUntilMs) return 'CLAIM_COOLDOWN'

    item.state = 'claiming'

    const correct = item.price === player.handValue
    if (correct) serve(state, cursor, player, item, events)
    else waste(state, player, item, events)

    releaseReservation(state, item)
    delete state.items[item.id]

    for (const belt of state.belts) {
        const slot = belt.slots.indexOf(item.id)
        if (slot !== -1) belt.slots[slot] = null
    }

    // No `score/patch` from here. `step()` sends one at the end of the tick, so
    // a tick that resolves two claims sends one patch rather than two, the
    // first of which is already stale by the time it is written.
    return null
}

function serve(state, cursor, player, item, events) {
    item.state = 'served'
    state.served += 1
    player.score += 1

    events.push({
        type: 'item/resolved',
        payload: { itemId: item.id, outcome: 'served', byPlayerId: player.id },
    })

    // A fresh hand, distinct from what everybody else is currently holding —
    // the same rule the opening deal follows, applied one player at a time.
    const taken = new Set(Object.values(state.players)
        .filter(other => other.id !== player.id && other.hand.length)
        .map(other => other.handValue))

    const { coins, value } = dealHand(cursor, state.difficulty, taken)

    player.hand = coins
    player.handValue = value
    player.handDealtAtMs = state.elapsedMs
    player.pendingMatchItemId = null
    player.matchWaitingSinceMs = state.elapsedMs

    events.push({
        type: 'hand/dealt',
        payload: { playerId: player.id, coins: [...coins] },
    })
}

/**
 * A wrong grab: the tray is wasted, the hand is unchanged, and that player —
 * only that player — is on cooldown.
 *
 * Keeping the hand is deliberate. Dealing a new one would let a child escape a
 * sum they could not do by guessing at it, which is the opposite of what the
 * game is for.
 */
function waste(state, player, item, events) {
    item.state = 'wasted'
    state.wasted += 1
    player.cooldownUntilMs = state.elapsedMs + CLAIM_COOLDOWN_MS

    // Classified against the hand that was held, not read off the tray's own
    // tag — the tray may have been baked as somebody else's decoy, and a
    // diagnosis has to be about the mistake this child actually made.
    const errorType = classifyGrab(item.price, player.hand, player.handValue)
    player.errors[errorType] = (player.errors[errorType] ?? 0) + 1

    events.push({
        type: 'item/resolved',
        payload: {
            itemId: item.id,
            outcome: 'wasted',
            byPlayerId: player.id,
            reason: 'wrong-price',
            errorType,
            cooldownUntilMs: player.cooldownUntilMs,
        },
    })
}
