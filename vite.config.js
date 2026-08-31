import { defineConfig } from 'vite'

// The frontend is plain ES modules; Vite only bundles and serves.
// `server/` is the future multiplayer backend and is not part of this build.
export default defineConfig({
    root: '.',
    publicDir: 'public',
    server: { port: 5173 },
    build: {
        outDir: 'dist',
        target: 'es2022',
        sourcemap: true,
    },
})
