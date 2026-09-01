/**
 * The lobby, driven with plain closures instead of sockets.
 *
 * `room.js` never imports `ws` — a player is whoever handed it a `send`
 * function — which is what makes this file possible without a network, a port,
 * or a teardown that leaks a listener into the next test.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { PLAYER_COLORS } from '../src/game/config.js'
import { createRoom } from '../src/rooms/room.js'

/** A player whose outbox is a list, so a test can read what they were told. */
function seat(room, name, resumeToken = null) {
    const inbox = []
    const result = room.join({ playerName: name, resumeToken, send: (type, payload) => inbox.push({ type, payload }) })

    return { ...result, inbox, last: type => [...inbox].reverse().find(one => one.type === type) }
}

const newRoom = (options = {}) => createRoom({ code: 'AB23', ...options })

describe('the lobby', () => {
    it('hands out colours in order, so the first child in is always red', () => {
        const room = newRoom()
        const seats = ['Ada', 'Bo', 'Cy', 'Di'].map(name => seat(room, name))

        assert.deepEqual(seats.map(one => one.colorSlot), [...PLAYER_COLORS])
    })

    it('makes the first player host and nobody else', () => {
        const room = newRoom()
        seat(room, 'Ada')
        seat(room, 'Bo')

        const hosts = room.snapshot().players.filter(player => player.isHost)
        assert.equal(hosts.length, 1)
        assert.equal(hosts[0].name, 'Ada')
    })

    it('turns away a fifth baker', () => {
        const room = newRoom()
        for (const name of ['Ada', 'Bo', 'Cy', 'Di']) seat(room, name)

        const overflow = room.join({ playerName: 'Ed', send: () => {} })
        assert.deepEqual(overflow, { ok: false, code: 'ROOM_FULL' })
    })

    it('migrates the host to the longest-connected player when the host drops', () => {
        const room = newRoom()
        const ada = seat(room, 'Ada')
        seat(room, 'Bo')
        seat(room, 'Cy')

        room.detach(ada.playerId)

        const host = room.snapshot().players.find(player => player.isHost)
        assert.equal(host.name, 'Bo', 'the next-longest-connected takes over')
    })

    it('frees the colour of a player who leaves the lobby', () => {
        const room = newRoom()
        const ada = seat(room, 'Ada')
        seat(room, 'Bo')

        room.detach(ada.playerId)
        const late = seat(room, 'Cy')

        assert.equal(late.colorSlot, 'red', 'red went back in the box')
    })

    it('rebinds a slot with a resume token rather than seating a stranger', () => {
        const room = newRoom()
        const ada = seat(room, 'Ada')
        seat(room, 'Bo')

        const back = seat(room, 'Ada', ada.resumeToken)

        assert.equal(back.playerId, ada.playerId, 'same seat')
        assert.equal(back.colorSlot, ada.colorSlot, 'same colour')
        assert.equal(room.snapshot().players.length, 2, 'no ghost was added')
    })

    it('tracks ready flags', () => {
        const room = newRoom()
        const ada = seat(room, 'Ada')
        seat(room, 'Bo')

        room.handle(ada.playerId, 'player/ready', { ready: true })

        const state = ada.last('room/state').payload
        assert.equal(state.players.find(one => one.id === ada.playerId).ready, true)
    })
})

describe('starting a game', () => {
    it('refuses a start from anyone but the host', () => {
        const room = newRoom()
        seat(room, 'Ada')
        const bo = seat(room, 'Bo')

        room.handle(bo.playerId, 'game/start', {})

        assert.equal(bo.last('error').payload.code, 'NOT_HOST')
        assert.equal(room.phase, 'lobby')
    })

    it('refuses a start with nobody to play with', () => {
        const room = newRoom()
        const ada = seat(room, 'Ada')

        room.handle(ada.playerId, 'game/start', {})

        assert.equal(ada.last('error').payload.code, 'NOT_ENOUGH_PLAYERS')
    })

    it('starts, and deals every player a hand of coin ids with no value attached', () => {
        const room = newRoom()
        const ada = seat(room, 'Ada')
        const bo = seat(room, 'Bo')

        room.handle(ada.playerId, 'game/start', { difficulty: 'easy' })

        assert.equal(room.phase, 'playing')

        const dealt = ada.inbox.filter(one => one.type === 'hand/dealt')
        assert.equal(dealt.length, 2, 'both hands are broadcast to everyone')

        for (const { payload } of dealt) {
            assert.ok(Array.isArray(payload.coins) && payload.coins.length)
            assert.equal(payload.value, undefined, 'the sum must never be on the wire')
        }

        // And the snapshot agrees, for a client that joins or asks for one.
        const game = bo.last('game/started').payload.game
        assert.ok(!JSON.stringify(game).includes('handValue'))
    })

    it('lets a lone baker play when solo is explicitly enabled', () => {
        const room = newRoom({ allowSolo: true })
        const ada = seat(room, 'Ada')

        room.handle(ada.playerId, 'game/start', {})

        assert.equal(room.phase, 'playing')
        room.destroy()
    })

    it('turns a latecomer away once the game is running', () => {
        const room = newRoom({ allowSolo: true })
        const ada = seat(room, 'Ada')
        room.handle(ada.playerId, 'game/start', {})

        assert.deepEqual(
            room.join({ playerName: 'Late', send: () => {} }),
            { ok: false, code: 'GAME_IN_PROGRESS' },
        )

        room.destroy()
    })

    it('rate-limits the claim path so one scripted client cannot drain a shared budget', () => {
        const room = newRoom({ allowSolo: true })
        const ada = seat(room, 'Ada')
        room.handle(ada.playerId, 'game/start', {})

        for (let i = 0; i < 40; i += 1) {
            room.handle(ada.playerId, 'action/claim', { itemId: 'whatever' })
        }

        const limited = ada.inbox.filter(one => one.type === 'error' && one.payload.code === 'RATE_LIMITED')
        assert.ok(limited.length > 0, 'forty claims in a tick went through unthrottled')

        room.destroy()
    })

    it('answers a time/sync with the client stamp echoed untouched', () => {
        const room = newRoom()
        const ada = seat(room, 'Ada')

        room.handle(ada.playerId, 'time/sync', { t0: 12345 })

        const reply = ada.last('time/sync').payload
        assert.equal(reply.t0, 12345)
        assert.equal(typeof reply.t1, 'number')
    })
})
