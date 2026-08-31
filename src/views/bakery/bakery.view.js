import { el, clear } from '../../lib/dom.js'
import { normalizeCode } from '../../lib/room-code.js'
import { createRoomAdapter } from './net/index.js'
import './bakery.css'

/**
 * SCAFFOLD. The lobby is wired end to end against the fake adapter — hosting,
 * joining, and the player list all work with no server. The game itself is not
 * designed yet.
 *
 * `?code=XXXX` joins an existing bakery; no code hosts a new one. The route
 * guard in routes.js is what stops an unfinished lesson from hosting.
 */
export function createBakeryView({ params, store, navigate }) {
    const joinCode = params.has('code') ? normalizeCode(params.get('code')) : null
    const isJoining = Boolean(joinCode)

    const adapter = createRoomAdapter()
    const unsubscribers = []

    const codeLabel = el('p', { class: 'pc-bakery__code' })
    const playerList = el('ul', { class: 'pc-bakery__players' })
    const statusLine = el('p', { class: 'pc-bakery__status', role: 'status' }, 'Connecting…')

    function renderRoom(room) {
        codeLabel.textContent = room.code ? `Bakery code: ${room.code}` : ''

        clear(playerList)
        for (const player of room.players) {
            playerList.appendChild(
                el('li', { class: 'pc-bakery__player' }, [
                    player.name,
                    player.isHost ? el('span', { class: 'pc-bakery__tag' }, 'host') : null,
                ]),
            )
        }

        statusLine.textContent = room.players.length < 2
            ? 'Waiting for a friend to join…'
            : `${room.players.length} bakers ready.`
    }

    unsubscribers.push(adapter.on('room/state', renderRoom))

    const connect = isJoining
        ? adapter.join({ code: joinCode, playerName: store.get('player.name') ?? 'You' })
        : adapter.host({ playerName: store.get('player.name') ?? 'You' })

    connect.catch(error => {
        statusLine.textContent = error.message
        codeLabel.textContent = ''
    })

    const root = el('section', { class: 'pc-bakery pc-stack' }, [
        el('header', {}, [
            el('h1', {}, isJoining ? 'Joining a bakery' : 'Your bakery'),
            el('p', { class: 'pc-bakery__note' },
                'Scaffold: the lobby runs on a fake in-memory adapter. No backend yet.'),
        ]),

        el('div', { class: 'pc-card pc-stack' }, [codeLabel, playerList, statusLine]),

        el('button', {
            type: 'button',
            class: 'pc-button pc-button--quiet',
            onClick: () => navigate('/'),
        }, 'Back to menu'),
    ])

    return {
        el: root,
        destroy() {
            for (const off of unsubscribers) off()
            // Always leave the room. A view torn down without this leaks a
            // connection and a ghost player into the lobby.
            adapter.leave()
            root.remove()
        },
    }
}
