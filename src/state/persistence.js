/**
 * Persistent state lives under one versioned localStorage key. Everything else
 * in the store is in-memory only — live game state is owned by the server.
 *
 * A stale or corrupt payload resets to defaults rather than throwing. A kid must
 * never hit a blank screen because of a key written by an older build.
 */

const STORAGE_KEY = 'playcademy.v1'

/** Only these keys are written to disk. */
export const PERSISTENT_KEYS = Object.freeze([
    'lesson.completed',
    'lesson.report',
    'player.name',
])

export const DEFAULTS = Object.freeze({
    'lesson.completed': false,
    'lesson.report': null,
    'player.name': null,
})

/**
 * Read persisted state, merged over the defaults. Any key that is missing,
 * unknown, or the wrong type falls back to its default.
 */
export function loadState() {
    let stored = null

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw) stored = JSON.parse(raw)
    } catch (error) {
        // Corrupt JSON, or storage blocked entirely (private mode, cookies off).
        console.warn('[persistence] could not read stored state, using defaults', error)
    }

    if (!stored || typeof stored !== 'object') return { ...DEFAULTS }

    const state = { ...DEFAULTS }

    for (const key of PERSISTENT_KEYS) {
        if (!Object.hasOwn(stored, key)) continue

        const value = stored[key]
        const expected = typeof DEFAULTS[key]

        // `null` is a legitimate value for the nullable keys.
        if (value === null || typeof value === expected || DEFAULTS[key] === null) {
            state[key] = value
        }
    }

    return state
}

/** Write the persistent subset of a store snapshot. Failure is non-fatal. */
export function saveState(snapshot) {
    const payload = {}
    for (const key of PERSISTENT_KEYS) payload[key] = snapshot[key] ?? DEFAULTS[key]

    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch (error) {
        // Quota exceeded or storage unavailable. The session still works.
        console.warn('[persistence] could not save state', error)
    }
}

/** Wipe persisted progress. Handy for demos and manual testing. */
export function clearState() {
    try {
        window.localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
        console.warn('[persistence] could not clear state', error)
    }
}
