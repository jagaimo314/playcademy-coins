/**
 * Seeded randomness. mulberry32 — 32 bits of state, a handful of operations,
 * and a period long enough that no bakery will ever see it wrap.
 *
 * The point is not statistical quality; it is that a whole game replays from
 * `(seed, intents[])`. "That spawn looked unfair" stops being an argument and
 * becomes a test with a seed number in it.
 *
 * `step()` is pure, so the seed lives in game state rather than in a closure
 * somebody could forget to reset. A cursor is opened over it at the top of a
 * tick and its final seed written back at the bottom — see the note on
 * `createCursor`.
 */

/** One step of mulberry32: seed in, `{ seed, value }` out, `value` in [0, 1). */
export function next(seed) {
    let t = (seed + 0x6d2b79f5) >>> 0
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x

    return { seed: t, value: ((x ^ (x >>> 14)) >>> 0) / 4294967296 }
}

/**
 * A mutable cursor over an immutable seed.
 *
 * `step()` promises that the same `(state, dtMs, intents)` always produces the
 * same result — it does not promise that nothing is assigned to along the way.
 * Threading `{ seed, value }` pairs through the dealer by hand would obscure
 * every line it touched to buy a purity the caller cannot observe. So: open a
 * cursor, use it, write `cursor.seed` back into the new state. The determinism
 * that matters is preserved exactly, and the code stays readable.
 *
 * Nothing may hold a cursor across ticks.
 */
export function createCursor(seed) {
    let current = seed >>> 0

    function float() {
        const rolled = next(current)
        current = rolled.seed
        return rolled.value
    }

    return {
        get seed() {
            return current
        },

        float,

        /** A whole number in `[min, max]`, both ends included. */
        int(min, max) {
            if (max < min) throw new RangeError(`empty range: ${min}..${max}`)
            return min + Math.floor(float() * (max - min + 1))
        },

        /** One entry of a non-empty list. */
        pick(list) {
            if (!list.length) throw new RangeError('pick from an empty list')
            return list[Math.floor(float() * list.length)]
        },

        /** True with probability `p`. */
        chance(p) {
            return float() < p
        },

        /**
         * A copy of `list` in a random order. Fisher-Yates, on a copy, because
         * shuffling the caller's array in place is how a frozen config becomes
         * a bug three files away.
         */
        shuffle(list) {
            const out = [...list]

            for (let i = out.length - 1; i > 0; i -= 1) {
                const j = Math.floor(float() * (i + 1))
                const swap = out[i]
                out[i] = out[j]
                out[j] = swap
            }

            return out
        },
    }
}

/**
 * A seed for a fresh game. This is the one place chance enters from outside;
 * everything downstream of it is reproducible.
 */
export function randomSeed() {
    return (Math.random() * 0xffffffff) >>> 0
}
