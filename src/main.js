import './styles/base.css'

import { createStore } from './state/store.js'
import { loadState, saveState, clearState } from './state/persistence.js'
import { createRouter } from './router.js'
import { routes } from './routes.js'

const mount = document.getElementById('app')

// Persisted progress is read once at boot; every later change writes through.
const store = createStore(loadState())
store.subscribeAll(saveState)

const router = createRouter({ mount, routes, store })
router.start()

// Dev-only handle for poking at state from the console — stripped from builds.
if (import.meta.env.DEV) {
    window.pc = { store, router, clearState }
}
