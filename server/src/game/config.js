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
 * It cannot go below 9. Every mixed tier now reaches 99¢, and 99¢ in US coins is
 * nine of them at its most efficient (three quarters, two dimes, four pennies) —
 * a tighter budget would make part of the range unreachable and the dealer would
 * quietly retry its way around it.
 *
 * Twelve rather than nine because the three spare coins are what `addVariety`
 * spends: at exactly nine, a 99¢ hand is the greedy decomposition and nothing
 * else, and a child learns the shape of the greedy algorithm instead of learning
 * to add. The wallet fits whatever it is handed by scaling the coins together,
 * so this is a legibility budget and not a layout constraint.
 */
export const MAX_HAND_COINS = 12

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
        maxBelts: 3,
        doors: 'closed',
        wasteOnExit: 'none',
        /*
         * The goal node, not the lesson's node.
         *
         * The brief asks for a multiplayer game for *summing a handful of coins*
         * — the top of the graph — and a single-denomination hand is KC13, the
         * thing the lesson already taught. So the shipped tier deals mixed hands
         * under a dollar: the child sorts the handful into like piles (KC14),
         * prices each pile by skip counting (KC13, what they just learned), and
         * adds the subtotals (KC15). That is the capstone, played.
         *
         * The slowest beat in the table stays with it. Mixed hands are the extra
         * load here; adding time pressure on top would be measuring typing speed.
         */
        hand: Object.freeze({ mixed: true, minValue: 5, maxValue: 99 }),
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
 * **The setup a game actually runs, and the one place the doors stay pinned.**
 *
 * Belt count is live and comes from `beltCountFor`. The doors are still held
 * open: `belts.js` implements the full rule (`canAdvance(MOUTH_SLOT) =
 * doorsOpen`), but the jam affordance a closed door produces — a belt visibly
 * backing up, and the UI that explains why — is M3. Shipping the rule without
 * the affordance would give a child a stalled belt and no reason for it.
 *
 * So M3 is deleting two lines here and reading the difficulty's `doors`.
 */
export function resolveSetup(playerCount, difficulty) {
    return {
        beltCount: beltCountFor(playerCount, difficulty),
        doorsOpen: true,
        // Decoys reaching the fire are free; food somebody was holding the coins
        // for is not. Even pinned open, this keeps `wasted` meaning *error*.
        wasteOnExit: 'matched',
        advanceMs: difficultyConfig(difficulty).advanceMs,
    }
}

/**
 * Belts by player count, indexed by it. Index 0 is unreachable and carries 1 so
 * the lookup is total.
 *
 * Two players get two belts rather than one, because one belt is a queue: eight
 * slots shared by two children means long stretches where nothing on screen is
 * worth either of their hands, and the one tray that is becomes a race instead
 * of two parallel problems. The fourth player is what buys the third belt —
 * three children still fit across two without crowding each other's targets.
 *
 * Not a formula. `ceil(n / 2)` reads as if it means something and then gives a
 * lone belt to the two-player game, which is precisely the case this table
 * exists to fix.
 */
const BELTS_BY_PLAYER_COUNT = Object.freeze([1, 1, 2, 2, 3])

/** Belts for a room of `playerCount`, never more than the tier allows. */
export function beltCountFor(playerCount, difficulty) {
    const { maxBelts } = difficultyConfig(difficulty)
    const seats = Math.min(Math.max(playerCount, 1), MAX_PLAYERS)

    return Math.min(BELTS_BY_PLAYER_COUNT[seats], maxBelts)
}

export const SERVE_TARGET = playerCount => SERVE_PER_PLAYER * playerCount
export const WASTE_LIMIT = playerCount => WASTE_PER_PLAYER * playerCount
