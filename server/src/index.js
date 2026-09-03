/**
 * The process: an HTTP server, a WebSocket upgrade on `/ws`, and in production
 * the built frontend served from the same origin.
 *
 * One origin is a deliberate choice and not a shortcut. It means one hosted URL
 * to hand over with the brief, no CORS, and no split deploy to explain. In dev
 * Vite keeps `:5173` and the client reads `VITE_WS_URL`, which is the only place
 * the two halves know about each other.
 */

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

import { createRegistry } from './rooms/registry.js'
import { createRoom } from './rooms/room.js'
import { createHeartbeat, decode, encode } from './transport/socket.js'
import { normalizeCode } from '../../src/lib/room-code.js'

const PORT = Number(process.env.PORT ?? 8787)
const DIST = resolve(fileURLToPath(new URL('../../dist', import.meta.url)))

/**
 * Lets one browser tab host and play a room on its own. Off by default — the
 * game is co-operative and `5n` with `n = 1` is not the game — but without it
 * there is no way to exercise the belt by hand before the bot client lands.
 */
const ALLOW_SOLO = process.env.BAKERY_ALLOW_SOLO === '1' || process.argv.includes('--solo')

const registry = createRegistry()

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.woff2': 'font/woff2',
    '.map': 'application/json; charset=utf-8',
}

const server = createServer(async (request, response) => {
    if (request.url === '/health') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ ok: true, rooms: registry.size }))
        return
    }

    await serveStatic(request, response)
})

/**
 * Static files, with the path resolved and then checked to be inside `dist/`.
 *
 * The check is not optional even for a school project: `request.url` is
 * attacker-controlled, and `join()` will happily resolve `../../etc/passwd`
 * into somewhere it should not go. Normalising first and comparing the result
 * against the root is the whole defence.
 */
async function serveStatic(request, response) {
    const url = new URL(request.url, 'http://localhost')
    const wanted = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '')
    const path = resolve(join(DIST, wanted))

    if (!path.startsWith(DIST)) {
        response.writeHead(403)
        response.end('Forbidden')
        return
    }

    try {
        const info = await stat(path)
        const file = info.isDirectory() ? join(path, 'index.html') : path
        const body = await readFile(file)

        response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
        response.end(body)
    } catch {
        // The app is a hash router, so any unknown path is a client route and
        // has to come back as the shell rather than a 404.
        try {
            response.writeHead(200, { 'content-type': MIME['.html'] })
            response.end(await readFile(join(DIST, 'index.html')))
        } catch {
            response.writeHead(404)
            response.end('Not found. Run `npm run build` first, or use the Vite dev server.')
        }
    }
}

const wss = new WebSocketServer({ server, path: '/ws' })
createHeartbeat(wss)

wss.on('connection', socket => {
    socket.isAlive = true
    socket.on('pong', () => { socket.isAlive = true })

    /** Set by the first `room/host` or `room/join`; null until then. */
    let bound = null

    const reply = (type, payload) => socket.send(encode(type, payload))

    socket.on('message', raw => {
        const message = decode(raw)
        if (!message) return

        if (message.type === 'room/host' || message.type === 'room/join') {
            enterRoom(message)
            return
        }

        // Anything else before a room is a client that has not read the
        // contract; there is no sensible room to route it to.
        if (!bound) {
            reply('error', { code: 'INVALID_ACTION', message: 'Join a bake sale first.' })
            return
        }

        bound.room.handle(bound.playerId, message.type, message.payload)
    })

    socket.on('close', () => {
        if (!bound) return

        bound.room.detach(bound.playerId)
        registry.markActivity(bound.room.code)
        bound = null
    })

    socket.on('error', error => {
        console.error('[ws] socket error', error.message)
    })

    function enterRoom({ type, payload }) {
        if (bound) {
            reply('error', { code: 'INVALID_ACTION', message: 'Already in a bake sale.' })
            return
        }

        const hosting = type === 'room/host'
        const code = hosting ? registry.issueCode() : normalizeCode(payload.code)
        const room = hosting
            ? registry.add(createRoom({ code, allowSolo: ALLOW_SOLO }))
            : registry.get(code)

        if (!room) {
            reply('error', { code: 'ROOM_NOT_FOUND', message: 'That bake sale code is not right.' })
            return
        }

        /*
         * Joining broadcasts `player/joined` and `room/state` to the whole room,
         * including the arriving player — who at that moment has not yet been
         * told their own id. A client would then be handed a player list it
         * cannot find itself in, and anything keyed on "am I the host" would be
         * wrong until the next broadcast, which for a room of one never comes.
         *
         * So the new player's frames are held back for the length of the join
         * and flushed after `room/joined`. You learn who you are first.
         */
        const held = []
        let flushed = false

        const result = room.join({
            playerName: String(payload.playerName ?? 'Baker').slice(0, 16),
            resumeToken: typeof payload.resumeToken === 'string' ? payload.resumeToken : null,
            // The room never learns what a socket is; it calls this.
            send: (outType, outPayload) => {
                if (flushed) socket.send(encode(outType, outPayload))
                else held.push([outType, outPayload])
            },
        })

        if (!result.ok) {
            reply('error', { code: result.code, message: 'That bake sale cannot take you right now.' })
            return
        }

        bound = { room, playerId: result.playerId }
        registry.markActivity(room.code)

        reply('room/joined', {
            code: room.code,
            playerId: result.playerId,
            resumeToken: result.resumeToken,
            colorSlot: result.colorSlot,
        })

        flushed = true
        for (const [outType, outPayload] of held) socket.send(encode(outType, outPayload))
    }
})

server.listen(PORT, () => {
    console.log(`[bakery] http + ws on :${PORT} (ws path /ws)`)
    if (ALLOW_SOLO) console.log('[bakery] solo play enabled')
})

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        registry.stop()
        wss.close()
        server.close(() => process.exit(0))
    })
}
