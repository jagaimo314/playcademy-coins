import { clear } from './lib/dom.js'

/**
 * Hash router. Hash-based so the built bundle drops onto any static host with
 * no rewrite rules.
 *
 * The router owns the view lifecycle: the outgoing view is destroyed before the
 * incoming one is mounted, so a view can never leak listeners or timers into
 * the next screen.
 */
export function createRouter({ mount, routes, store, fallback = '/' }) {
    let current = null

    /** Parse `#/bakery?code=ABCD` into `{ path, params }`. */
    function parseHash(hash) {
        const raw = hash.replace(/^#/, '') || fallback
        const [path, query = ''] = raw.split('?')

        return {
            path: path.startsWith('/') ? path : `/${path}`,
            params: new URLSearchParams(query),
        }
    }

    function resolve(path) {
        return routes.find(route => route.path === path) ?? null
    }

    function render() {
        const { path, params } = parseHash(window.location.hash)
        const route = resolve(path)

        if (!route) {
            navigate(fallback, { replace: true })
            return
        }

        // Guards live in the route table, not in the views — a typed URL must
        // not be able to skip a gate the menu enforces.
        const redirect = route.guard?.({ store, params })
        if (redirect) {
            navigate(redirect, { replace: true })
            return
        }

        current?.destroy?.()
        current = null

        clear(mount)

        const view = route.view({ params, store, navigate })
        current = view
        mount.appendChild(view.el)

        document.title = route.title ?? 'Playcademy'

        // Move focus to the new screen so keyboard and screen-reader users land
        // on the content rather than back at the top of the document.
        mount.focus({ preventScroll: true })
        window.scrollTo(0, 0)
    }

    /** Navigate to `#/path`. Views call this rather than touching location. */
    function navigate(to, { replace = false } = {}) {
        const target = `#${to.startsWith('/') ? to : `/${to}`}`

        if (window.location.hash === target) {
            render()
            return
        }

        if (replace) {
            window.location.replace(target)
        } else {
            window.location.hash = target
        }
    }

    function onHashChange() {
        render()
    }

    return {
        navigate,

        start() {
            window.addEventListener('hashchange', onHashChange)
            if (!window.location.hash) window.location.replace(`#${fallback}`)
            render()
        },

        destroy() {
            window.removeEventListener('hashchange', onHashChange)
            current?.destroy?.()
            current = null
        },
    }
}
