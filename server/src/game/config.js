/**
 * Every number the game is played by, in one file.
 *
 * `docs/bakery-backend-plan.md` pins these in prose; this is the executable copy
 * and the two are meant to be read together. Nothing else in `server/` may hold
 * a game constant — a tuning number that lives at its call site is a number
 * nobody finds when the game plays wrong.
 */

/**
 * Slots on a belt, indexed 0 at the oven to `MOUTH_SLOT` at the incinerator.
 * A slot holds at most one tray, which is what makes the jam rule structural
 * rather than a cap somebody has to remember to enforce.
 */
export const SLOT_COUNT = 8
export const MOUTH_SLOT = SLOT_COUNT - 1

/**
 * Simulation rate. With stepped belts this no longer buys motion smoothness —
 * it is the resolution at which two claims can be told apart, plus the
 * granularity of cooldowns and door timers.
 */
export const TICK_MS = 50

/**
 * Slot pitch in client pixels, quoted here purely so one number describes the
 * belt on both sides of the wire. **Nothing server-side computes with it**; the
 * server reasons in slot indices and the client maps an index into its own
 * geometry.
 *
 * Eight slots at 120 span 960px, which sits at `x 60–1020` in the 1200-wide
 * frame: 60px of margin at the oven and a 60px run-up to the incinerator at
 * 1080. The earlier 160 spanned 1280 and ran straight through the fire.
 */
export const SLOT_PITCH_PX = 120

/**
 * How long the client's hop takes. Server-side an advance is instantaneous —
 * one array shift — so this is quoted for the client and for the assertion that
 * it stays comfortably inside the fastest advance interval below.
 */
export const HOP_MS = 260

/**
 * Load-bearing, not decoration. Without it, grabbing every tray until one
 * sticks is the optimal strategy, and `wasted` is a *shared* budget — one kid
 * brute-forcing would end the game for everybody at the table.
 */
export const CLAIM_COOLDOWN_MS = 1500

/**
 * The solvability guarantee: no live hand goes longer than this without a tray
 * at its price on a belt. A kid stuck holding 35¢ while the bakery refuses to
 * bake a 35¢ tray is the failure mode that makes the whole game feel broken.
 */
export const MATCH_WINDOW_MS = 12000

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 4

/** The win and lose conditions, both scaled by player count. */
export const SERVE_PER_PLAYER = 5
export const WASTE_PER_PLAYER = 5

/**
 * Panel colours, handed out by index as players join.
 *
 * **This list and `PLAYER_COLORS` in `src/components/player-wallet/player-wallet.js`
 * must stay in the same order.** The server sends a `colorSlot` string, not an
 * index, so a disagreement does not crash anything — it just quietly makes the
 * first player red on one side and blue on the other.
 */
export const PLAYER_COLORS = Object.freeze(['red', 'blue', 'green', 'yellow'])

/**
 * How long a hand is allowed to be, whatever its value. Not a rule of the game —
 * a rule of the wallet, which fits a hand by shrinking its coins, so twenty
 * pennies is legal arithmetic and an illegible panel.
 *
 * It cannot go below 9. Hard mode reaches 99¢, and 99¢ in US coins is nine of
 * them at its most efficient (three quarters, two dimes, four pennies) — a
 * tighter budget would make part of the range unreachable and the dealer would
 * quietly retry its way around it.
 */
export const MAX_HAND_COINS = 10

/**
 * The difficulty table.
 *
 * `wasteOnExit` decides what a tray falling into an open incinerator costs:
 * `'none'`, `'matched'` (only food somebody could actually have bought), or
 * `'all'`. Without that distinction the waste counter is a stopwatch rather
 * than a measure of error — decoys nobody could buy would tick it up on their
 * own schedule.
 *
 * `doors: 'closed'` is easy mode's pressure: nothing is ever wasted at the exit,
 * the belt backs up instead, and throughput dies. `'cycling'` and the jam rule
 * that makes any of this visible are M3 — see `M2_SETUP` below.
 */
export const DIFFICULTIES = Object.freeze({
    easy: Object.freeze({
        advanceMs: 3000,
        maxBelts: 1,
        doors: 'closed',
        wasteOnExit: 'none',
        // Exactly the knowledge component the lesson teaches: one denomination,
        // skip-counted. A kid arriving from the lesson has already done this.
        hand: Object.freeze({ mixed: false, minValue: 5, maxValue: 25 }),
    }),
    medium: Object.freeze({
        advanceMs: 2000,
        maxBelts: 2,
        doors: 'cycling',
        doorOpenMs: 8000,
        doorClosedMs: 8000,
        wasteOnExit: 'matched',
        hand: Object.freeze({ mixed: true, minValue: 5, maxValue: 50 }),
    }),
    hard: Object.freeze({
        advanceMs: 1300,
        maxBelts: 3,
        doors: 'open',
        wasteOnExit: 'all',
        hand: Object.freeze({ mixed: true, minValue: 10, maxValue: 99 }),
    }),
})

export const DEFAULT_DIFFICULTY = 'medium'

/** Throws on an unknown name here, rather than reading `undefined.advanceMs` later. */
export function difficultyConfig(name) {
    const found = DIFFICULTIES[name]
    if (!found) throw new Error(`Unknown difficulty: ${name}`)
    return found
}

/**
 * **The M2 pin, and the one place M3 unpins it.**
 *
 * M2's deliverable is a game that is playable, not a game that is tuned. So it
 * runs one belt with the doors held open: the mouth always empties, a belt can
 * never back up, and the jam affordance and the incinerator — the things a
 * closed door is *for* — stay in M3 where they belong.
 *
 * `belts.js` implements the full rule anyway (`canAdvance(MOUTH_SLOT) =
 * doorsOpen`), so M3 is deleting this function and calling `beltCountFor` and
 * the difficulty's `doors` directly. Nothing in the motion code changes.
 */
export function resolveSetup(playerCount, difficulty) {
    return {
        beltCount: 1,
        doorsOpen: true,
        // Decoys reaching the fire are free; food somebody was holding the coins
        // for is not. Even pinned open, this keeps `wasted` meaning *error*.
        wasteOnExit: 'matched',
        advanceMs: difficultyConfig(difficulty).advanceMs,
    }
}

/**
 * M3's belt count. Written now because it is one line and the plan pins it;
 * `resolveSetup` above is what actually decides until M3 lands.
 */
export function beltCountFor(playerCount, difficulty) {
    const { maxBelts } = difficultyConfig(difficulty)
    return Math.min(Math.max(Math.ceil(playerCount / 2), 1), 3, maxBelts)
}

export const SERVE_TARGET = playerCount => SERVE_PER_PLAYER * playerCount
export const WASTE_LIMIT = playerCount => WASTE_PER_PLAYER * playerCount
