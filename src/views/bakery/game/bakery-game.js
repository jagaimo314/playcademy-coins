import { animationSettled, clear, el, prefersReducedMotion } from '../../../lib/dom.js'
import { createConveyorBelt, HOP_MS } from '../../../components/conveyor-belt/conveyor-belt.js'
import { createConveyorItem } from '../../../components/conveyor-item/conveyor-item.js'
import { createPlayerWallet } from '../../../components/player-wallet/player-wallet.js'
import './bakery-game.css'

/**
 * The bakery floor: belts across the middle, a colour-coded hand for every
 * player along the base, and the two shared counters at the top.
 *
 * **This is a mirror, not a model.** Every number on this screen is owned by the
 * server; this file holds a local copy so it has something to draw between
 * messages, and every field of it is overwritten by the next snapshot. It is
 * deliberately not in the store: the store is for what survives a view, and none
 * of this does.
 *
 * The one job that genuinely belongs here is the **id-to-tray map**.
 * `belt/advanced` carries `itemId`s and `conveyor-belt.setSlotItems()` takes tray
 * *instances*, so something has to hold the correspondence — and that same
 * something owns a tray's flight once the belt has detached it.
 */

/**
 * A fixed frame, like the Lesson's, so the geometry is identical on every
 * display. A belt that was 8 slots wide on a laptop and 8 slots narrow on a
 * tablet would make "which tray did you tap" a different question per device.
 */
const FRAME = Object.freeze({ width: 1200, height: 800 })

/** The three bands of the floor, measured from the frame's top edge. */
const BAKERY_TOP = 70
const BAKERY_BOTTOM = 620
const BASE_TOP = 640

/** Where the incinerator will go at M3. Belts stop short of it. */
const INCINERATOR_X = 1080

/** Left margin for the belts, so the oven end is not flush against the frame. */
const BELT_X = 60

const WALLET_MARGIN = 20
const WALLET_GAP = 12

export function createBakeryGame({ playerId, config, game, onClaim }) {
    const slotPitch = config.slotPitchPx ?? 120
    const slotCount = config.slotCount ?? 8
    const hopMs = config.hopMs ?? HOP_MS

    /** `itemId -> tray instance`. The mirror the whole file exists for. */
    const trays = new Map()
    /** `beltId -> belt instance`. */
    const belts = new Map()
    /** `playerId -> wallet instance`. */
    const wallets = new Map()

    let ended = null

    /* --------------------------------------------------------------- chrome */

    const servedLabel = el('strong', { class: 'pc-game__count' }, '0')
    const wastedLabel = el('strong', { class: 'pc-game__count' }, '0')

    const scoreBar = el('div', { class: 'pc-game__scores', role: 'status' }, [
        el('p', { class: 'pc-game__score pc-game__score--served' },
            ['Served ', servedLabel, el('span', {}, ` of ${game.target}`)]),
        el('p', { class: 'pc-game__score pc-game__score--wasted' },
            ['Wasted ', wastedLabel, el('span', {}, ` of ${game.wasteLimit}`)]),
    ])

    const beltLayer = el('div', { class: 'pc-game__belts' })
    const walletRow = el('div', { class: 'pc-game__base' })

    /**
     * Where a tray goes once it is off a belt and still has something to do.
     * Above the belts, so a tray flying to a wallet passes over the machinery
     * rather than under it.
     */
    const flightLayer = el('div', { class: 'pc-game__flights' })

    const overlay = el('div', { class: 'pc-game__overlay', hidden: true })

    const frame = el('div', {
        class: 'pc-game__frame',
        style: { '--pc-game-width': `${FRAME.width}px`, '--pc-game-height': `${FRAME.height}px` },
    }, [scoreBar, beltLayer, flightLayer, walletRow, overlay])

    const root = el('section', { class: 'pc-game' }, frame)

    /* ---------------------------------------------------------------- build */

    /**
     * Belts are spread down the bakery band rather than pinned to fixed rows, so
     * one belt sits in the middle of the space and three fill it evenly. M3
     * turns this from a constant into something that changes with the player
     * count without any of the maths moving.
     */
    function buildBelts(list) {
        for (const belt of belts.values()) belt.destroy()
        belts.clear()
        clear(beltLayer)

        const band = BAKERY_BOTTOM - BAKERY_TOP

        list.forEach((wire, index) => {
            const belt = createConveyorBelt({ slotWidth: slotPitch, slotCount })

            // The pitch is quoted by the server, so a change there could push
            // the mouth straight through the incinerator — which is exactly the
            // bug the 120px pitch was chosen to fix. Caught here rather than
            // discovered by looking at it.
            if (BELT_X + belt.width > INCINERATOR_X) {
                console.warn(
                    `[bakery] a belt of ${slotCount} slots at ${slotPitch}px runs to `
                    + `${BELT_X + belt.width}px, past the incinerator at ${INCINERATOR_X}px`)
            }

            const share = band / list.length
            const top = BAKERY_TOP + share * index + (share - belt.height) / 2

            belt.el.classList.add('pc-game__belt')
            belt.el.style.setProperty('--pc-belt-x', `${BELT_X}px`)
            belt.el.style.setProperty('--pc-belt-y', `${Math.round(top)}px`)

            belts.set(wire.id, belt)
            beltLayer.appendChild(belt.el)
        })
    }

    function buildWallets(players) {
        for (const wallet of wallets.values()) wallet.destroy()
        wallets.clear()
        clear(walletRow)

        const list = Object.values(players)
        const width = Math.floor(
            (FRAME.width - WALLET_MARGIN * 2 - WALLET_GAP * (list.length - 1)) / list.length)

        for (const player of list) {
            const wallet = createPlayerWallet({
                name: player.name,
                color: player.colorSlot,
                coins: player.coins ?? [],
                width,
                height: FRAME.height - BASE_TOP - WALLET_MARGIN,
            })

            // Whose hand this is has to be sayable, not just shown by position:
            // a child on a screen reader walks the panels in order and needs to
            // know which one is theirs.
            if (player.id === playerId) wallet.el.classList.add('is-you')

            wallets.set(player.id, wallet)
            walletRow.appendChild(wallet.el)
        }
    }

    /**
     * A tray, wired to claim itself.
     *
     * `conveyor-item` reports its *price* on activation, which is what a display
     * tray should do — so the id is closed over here instead. This is the only
     * place that knows both.
     */
    function makeTray(wire) {
        const tray = createConveyorItem({
            price: wire.price,
            trayWidth: Math.round(slotPitch * 0.82),
            onClick: () => claim(wire.id),
        })

        trays.set(wire.id, tray)
        return tray
    }

    /**
     * Optimistic reach, honest scoring.
     *
     * The tray is marked chosen the instant it is tapped, because a six-year-old
     * who sees nothing happen taps again. But the counters, the plate and the
     * hand do not move until `item/resolved` says so — and if the server refuses
     * the claim, `rollback` puts the tray back.
     */
    function claim(itemId) {
        if (ended) return

        trays.get(itemId)?.update({ selected: true })
        onClaim(itemId)
    }

    function rollback() {
        for (const tray of trays.values()) tray.update({ selected: false })
    }

    /* --------------------------------------------------------------- events */

    function applySnapshot(next) {
        game = next

        buildBelts(next.belts)
        buildWallets(next.players)

        for (const tray of trays.values()) tray.destroy()
        trays.clear()
        clear(flightLayer)

        for (const wire of Object.values(next.items)) makeTray(wire)

        for (const wire of next.belts) {
            // No animation on a resync. The client has just been told where
            // everything is after missing some of it; hopping from a position
            // it never showed would be a lie about what happened.
            belts.get(wire.id)?.setSlotItems(wire.slots.map(id => trays.get(id) ?? null))
        }

        setScores(next)
    }

    function applyEvent(type, payload) {
        switch (type) {
            case 'item/spawned':
                makeTray(payload.item)
                return

            case 'belt/advanced':
                advance(payload)
                return

            case 'item/resolved':
                resolve(payload)
                return

            case 'hand/dealt':
                wallets.get(payload.playerId)?.update({ coins: payload.coins })
                return

            case 'score/patch':
                setScores(payload)
                return

            case 'player/connection':
                wallets.get(payload.playerId)?.el.classList.toggle('is-gone', !payload.connected)
                return

            case 'game/ended':
                finish(payload)
                return

            case 'error':
                // ITEM_GONE and CLAIM_COOLDOWN both mean "that reach did not
                // happen", which is exactly what the optimistic mark promised.
                rollback()
        }
    }

    function advance({ beltId, slots, jammed }) {
        const belt = belts.get(beltId)
        if (!belt) return

        belt.el.classList.toggle('is-jammed', Boolean(jammed))
        belt.setSlotItems(slots.map(id => trays.get(id) ?? null), { animate: true, duration: hopMs })
    }

    /**
     * A tray has left the game.
     *
     * The belt is told first, and told synchronously, so the authoritative
     * `belt/advanced` that follows agrees with what is on screen. Then the tray
     * is ours: `conveyor-belt` detaches trays rather than destroying them
     * precisely so a claimed one still has a flight to fly.
     */
    function resolve({ itemId, outcome, byPlayerId }) {
        const tray = trays.get(itemId)
        if (!tray) return

        trays.delete(itemId)

        const belt = [...belts.values()].find(one => one.slotItems.includes(tray))
        const from = belt && trayRect(belt, tray)

        belt?.setSlotItems(belt.slotItems.map(one => (one === tray ? null : one)))

        if (!from) {
            tray.destroy()
            return
        }

        flyAway(tray, from, outcome, byPlayerId)
    }

    /** A tray's position in frame coordinates, taken before the belt lets go of it. */
    function trayRect(belt, tray) {
        const index = belt.slotItems.indexOf(tray)
        const { x, y } = belt.slotCenter(index)
        const beltTop = Number.parseFloat(belt.el.style.getPropertyValue('--pc-belt-y')) || 0

        return {
            left: BELT_X + x - tray.width / 2,
            top: beltTop + y - tray.height,
        }
    }

    /**
     * The tray's last second on screen: served food flies to the plate it was
     * bought for, wasted food falls.
     *
     * Both end in `destroy()`, and both go through `animationSettled` — a
     * backgrounded tab never settles `animation.finished`, and every one of
     * these would then leak its node and its listeners.
     */
    async function flyAway(tray, from, outcome, byPlayerId) {
        const holder = el('div', { class: 'pc-game__flight', style: { left: `${from.left}px`, top: `${from.top}px` } })

        holder.appendChild(tray.el)
        flightLayer.appendChild(holder)

        const wallet = byPlayerId && wallets.get(byPlayerId)
        const target = outcome === 'served' && wallet
            ? destinationFor(wallet, from)
            : { x: 0, y: 120 }

        if (!prefersReducedMotion()) {
            const flight = holder.animate([
                { transform: 'translate(0, 0)', opacity: 1 },
                { transform: `translate(${target.x}px, ${target.y}px)`, opacity: 0 },
            ], { duration: 420, easing: outcome === 'served' ? 'ease-in' : 'ease-out' })

            await animationSettled(flight, 600)
        }

        tray.destroy()
        holder.remove()
    }

    /** How far the tray has to travel to land on its buyer's panel. */
    function destinationFor(wallet, from) {
        const frameBox = frame.getBoundingClientRect()
        const walletBox = wallet.el.getBoundingClientRect()

        // The frame is scaled to fit small screens, so client pixels are not
        // frame pixels. Dividing by the measured scale converts back.
        const scale = frameBox.width / FRAME.width || 1

        return {
            x: (walletBox.left + walletBox.width / 2 - frameBox.left) / scale - from.left,
            y: (walletBox.top - frameBox.top) / scale - from.top,
        }
    }

    function setScores(next) {
        servedLabel.textContent = String(next.served)
        wastedLabel.textContent = String(next.wasted)

        // Never colour alone: the counters are already red and green, so the
        // status role above reads the numbers out as well.
        scoreBar.setAttribute('aria-label',
            `Served ${next.served} of ${next.target}. Wasted ${next.wasted} of ${next.wasteLimit}.`)
    }

    function finish(payload) {
        ended = payload

        const won = payload.outcome === 'win'
        const mine = payload.results.players.find(one => one.id === playerId)

        clear(overlay)
        overlay.hidden = false
        overlay.classList.toggle('is-win', won)

        overlay.append(
            el('h2', {}, won ? 'The bakery is happy!' : 'The bakery ran out of patience.'),
            el('p', {}, `You served ${payload.results.served} of ${payload.results.target}.`),
            mine ? el('p', {}, `You alone served ${mine.score}.`) : null,
        )
    }

    /* ------------------------------------------------------------------ init */

    applySnapshot(game)

    return {
        el: root,
        applyEvent,
        applySnapshot,

        /**
         * Everything here holds children, so everything here has to be let go
         * of by hand. `destroy()` is where this app leaks.
         */
        destroy() {
            for (const tray of trays.values()) tray.destroy()
            for (const belt of belts.values()) belt.destroy()
            for (const wallet of wallets.values()) wallet.destroy()

            trays.clear()
            belts.clear()
            wallets.clear()

            root.remove()
        },
    }
}
