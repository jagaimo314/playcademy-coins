import { clear, el } from '../../lib/dom.js'
import { normalizeCode } from '../../lib/room-code.js'
import { createPrimaryButton } from '../../components/primary-button/primary-button.js'
import { createBakeryGame } from './game/bakery-game.js'
import { createRoomAdapter } from './net/index.js'
import './bakery.css'

/**
 * The Bakery: a lobby that becomes a game.
 *
 * `?code=XXXX` joins an existing bakery; no code hosts a new one. The route
 * guard in `routes.js` is what stops an unfinished lesson from hosting — joining
 * by code is deliberately ungated, because an invited kid can always accept.
 *
 * The view owns the socket and the phase; `game/bakery-game.js` owns everything
 * that happens on the floor. Nothing here computes a score, a position or an
 * outcome: this is the client of an authoritative server, and its whole job is
 * to render what it is told and forward what its player did.
 */
export function createBakeryView({ params, store, navigate }) {
    const joinCode = params.has('code') ? normalizeCode(params.get('code')) : null
    const isJoining = Boolean(joinCode)

    const adapter = createRoomAdapter()
    const unsubscribers = []

    let me = null
    let game = null
    let room = null

    /* --------------------------------------------------------------- lobby */

    const codeLabel = el('p', { class: 'pc-bakery__code' })
    const playerList = el('ul', { class: 'pc-bakery__players' })
    const statusLine = el('p', { class: 'pc-bakery__status', role: 'status' }, 'Connecting…')

    const readyButton = createPrimaryButton({
        label: 'I am ready',
        variant: 'gold',
        onClick: () => adapter.send('player/ready', { ready: !isReady() }),
    })

    const startButton = createPrimaryButton({
        label: 'Start baking',
        variant: 'green',
        onClick: () => adapter.send('game/start', { difficulty: 'easy' }),
    })

    const backButton = createPrimaryButton({
        label: 'Back to menu',
        variant: 'quiet',
        onClick: () => navigate('/'),
    })

    const lobby = el('div', { class: 'pc-bakery pc-stack' }, [
        el('header', {}, [
            el('h1', {}, isJoining ? 'Joining a bakery' : 'Your bakery'),
            el('p', { class: 'pc-bakery__note' },
                'Read the code out to your friends. They type it on the menu.'),
        ]),

        el('div', { class: 'pc-card pc-stack' }, [codeLabel, playerList, statusLine]),
        el('div', { class: 'pc-bakery__actions' }, [readyButton.el, startButton.el]),

        backButton.el,
    ])

    const root = el('section', { class: 'pc-bakery-stage' }, lobby)

    const isReady = () => room?.players.find(player => player.id === me)?.ready ?? false
    const amHost = () => room?.players.find(player => player.id === me)?.isHost ?? false

    function renderLobby() {
        if (!room) return

        codeLabel.textContent = room.code ? `Bakery code: ${room.code}` : ''

        clear(playerList)

        for (const player of room.players) {
            playerList.appendChild(
                el('li', {
                    class: ['pc-bakery__player', `pc-bakery__player--${player.colorSlot}`],
                }, [
                    player.name,
                    // The colour is a border, so it is also written down. A panel
                    // identified only by the colour of its edge is identified by
                    // nothing at all to a child who cannot see it.
                    el('span', { class: 'pc-bakery__tag' }, player.colorSlot),
                    player.isHost ? el('span', { class: 'pc-bakery__tag' }, 'host') : null,
                    player.ready ? el('span', { class: 'pc-bakery__tag pc-bakery__tag--ready' }, 'ready') : null,
                ]),
            )
        }

        const enough = room.players.length >= room.config.minPlayers

        statusLine.textContent = enough
            ? `${room.players.length} bakers in the kitchen.`
            : 'Waiting for a friend to join…'

        readyButton.update({ label: isReady() ? 'Wait, not yet' : 'I am ready' })

        // Only the host may start, and a disabled button has to say why — a K-2
        // kid cannot infer anything at all from a greyed-out control.
        startButton.el.hidden = !amHost()
        startButton.update({
            disabled: !enough,
            disabledReason: enough ? null : 'You need a friend before you can start.',
        })
    }

    /* ---------------------------------------------------------------- game */

    function startGame(payload) {
        game = createBakeryGame({
            playerId: me,
            config: payload.config ?? room.config,
            game: payload.game,
            onClaim: itemId => adapter.send('action/claim', { itemId }),
        })

        clear(root)
        root.appendChild(game.el)
    }

    /* ------------------------------------------------------------- wiring */

    /**
     * Every server message the floor cares about is forwarded verbatim. The
     * view does not interpret them — it only decides whether there is a floor
     * to forward them to yet.
     */
    for (const type of [
        'item/spawned', 'belt/advanced', 'item/resolved',
        'hand/dealt', 'score/patch', 'player/connection', 'game/ended', 'error',
    ]) {
        unsubscribers.push(adapter.on(type, payload => game?.applyEvent(type, payload)))
    }

    unsubscribers.push(adapter.on('room/state', next => {
        room = next

        if (next.phase === 'playing' && !game && next.game) startGame({ game: next.game })
        // A snapshot mid-game is a resync — a reconnect, or a client that missed
        // messages. Snapshot-plus-patch: ask for the state rather than replay.
        else if (game && next.game) game.applySnapshot(next.game)
        else if (!game) renderLobby()
    }))

    unsubscribers.push(adapter.on('game/started', payload => {
        if (!game) startGame(payload)
    }))

    const connect = isJoining
        ? adapter.join({ code: joinCode, playerName: store.get('player.name') ?? 'You' })
        : adapter.host({ playerName: store.get('player.name') ?? 'You' })

    connect
        .then(result => {
            me = result.playerId
            codeLabel.textContent = `Bakery code: ${result.code ?? joinCode}`
            // Whether this arrives before or after the first `room/state` is a
            // transport detail, and the lobby must not read differently either
            // way — half of what it renders depends on knowing which player is
            // us. Cheap to redraw; expensive to depend on message order.
            renderLobby()
        })
        .catch(error => {
            statusLine.textContent = error.message
            codeLabel.textContent = ''
            startButton.el.hidden = true
            readyButton.el.hidden = true
        })

    return {
        el: root,
        destroy() {
            for (const off of unsubscribers) off()

            game?.destroy()
            readyButton.destroy()
            startButton.destroy()
            backButton.destroy()
            // Always leave the room. A view torn down without this leaks a
            // connection and a ghost player into the lobby.
            adapter.leave()
            root.remove()
        },
    }
}
