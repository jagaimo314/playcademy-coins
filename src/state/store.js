import { createEmitter } from '../lib/emitter.js'

/**
 * A tiny observable key/value store. Flat string keys, no reducers.
 * Views read from it and pass values down; components never touch it.
 */
export function createStore(initial = {}) {
    const state = { ...initial }
    const emitter = createEmitter()

    const CHANGE = '*'

    return {
        /** Current value for `key`. */
        get(key) {
            return state[key]
        },

        /** A shallow copy of the whole state. */
        snapshot() {
            return { ...state }
        },

        /** Set one key. No-op (and no notification) if the value is unchanged. */
        set(key, value) {
            if (Object.is(state[key], value)) return
            state[key] = value
            emitter.emit(key, value)
            emitter.emit(CHANGE, { ...state })
        },

        /** Set several keys at once, notifying `subscribeAll` only once. */
        update(patch) {
            const changed = Object.entries(patch)
                .filter(([key, value]) => !Object.is(state[key], value))

            if (changed.length === 0) return

            for (const [key, value] of changed) state[key] = value
            for (const [key, value] of changed) emitter.emit(key, value)
            emitter.emit(CHANGE, { ...state })
        },

        /** Watch one key. Returns an unsubscribe function. */
        subscribe(key, handler) {
            return emitter.on(key, handler)
        },

        /** Watch every change. Returns an unsubscribe function. */
        subscribeAll(handler) {
            return emitter.on(CHANGE, handler)
        },
    }
}
