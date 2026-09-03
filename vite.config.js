import { defineConfig } from 'vite'

// The frontend is plain ES modules; Vite only bundles and serves.
// `server/` is the future multiplayer backend and is not part of this build.
export default defineConfig({
    root: '.',
    publicDir: 'public',
    server: {
        port: 5173,
        /*
         * In production one process serves the page and the socket, so
         * `ws-room-adapter` asks for `/ws` on its own origin — no config and no
         * CORS. This makes dev behave the same way instead of needing a
         * `VITE_WS_URL` pointing at the backend's own port.
         *
         * Dev only: `server` is not read by `vite build`. Start the backend
         * with `npm --prefix server start`; without it the socket simply fails
         * to connect, which is what the lobby's "Connecting…" already reports.
         */
        proxy: {
            '/ws': { target: 'ws://localhost:8787', ws: true },
        },
    },
    build: {
        outDir: 'dist',
        target: 'es2022',
        sourcemap: true,
    },
})
