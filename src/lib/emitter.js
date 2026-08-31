/**
 * Minimal event emitter. Used by the store and the network adapters.
 * `on` returns its own unsubscribe function so callers never have to hold
 * onto the handler reference to clean up.
 */
export function createEmitter() {
    /** @type {Map<string, Set<Function>>} */
    const handlers = new Map()

    return {
        /** Subscribe to `type`. Returns an unsubscribe function. */
        on(type, handler) {
            if (!handlers.has(type)) handlers.set(type, new Set())
            handlers.get(type).add(handler)

            return () => {
                const set = handlers.get(type)
                if (!set) return
                set.delete(handler)
                if (set.size === 0) handlers.delete(type)
            }
        },

        /**
         * Emit to every handler for `type`. A throwing handler is reported
         * but does not stop the others — one broken listener must not take
         * down a running game.
         */
        emit(type, payload) {
            const set = handlers.get(type)
            if (!set) return

            for (const handler of [...set]) {
                try {
                    handler(payload)
                } catch (error) {
                    console.error(`[emitter] handler for "${type}" threw`, error)
                }
            }
        },

        /** Drop every handler. Called on teardown. */
        clear() {
            handlers.clear()
        },
    }
}
