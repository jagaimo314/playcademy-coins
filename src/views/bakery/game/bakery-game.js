import { animationSettled, append, clear, el, prefersReducedMotion, svg } from '../../../lib/dom.js'
import { starPoints } from '../../../lib/geometry.js'
import { goodFor } from '../../../lib/goods.js'
import { createBakeryCounter } from '../../../components/bakery-counter/bakery-counter.js'
import { createConveyorBelt, HOP_MS, trayWidthFor } from '../../../components/conveyor-belt/conveyor-belt.js'
import { createConveyorItem } from '../../../components/conveyor-item/conveyor-item.js'
import { createDuct } from '../../../components/duct/duct.js'
import { createMeter } from '../../../components/meter/meter.js'
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

/*
 * The floor, in design pixels.
 *
 * A fixed frame, like the Lesson's, so the geometry is identical on every
 * display. A belt that was 8 slots wide on a laptop and 8 slots narrow on a
 * tablet would make "which tray did you tap" a different question per device.
 * The Lesson's box is the same 1280 across and 28 shorter — it came off 720
 * when its frame was reworked round a 64 cell. Two screens in one app should
 * not have two design boxes, so keep them together when either one moves.
 *
 * Every band below is a named constant and the height is *derived* from them
 * rather than typed. The sum has to come to 720 and has to keep coming to 720,
 * which is a property a derivation holds and a literal does not.
 */
const FRAME_WIDTH = 1280

/** The toolbar: two segmented meters, and nothing else. */
const TOOLBAR_H = 64

/** A lane: a tray box and the band it rides on. Asserted against the belt below. */
const LANE_H = 112
const LANE_PITCH = 124
const LANE_LEAD = 8         /* clearance between the toolbar and the first lane */
const LANES = 3             /* what the bay is sized for; fewer belts centre in it */

const BELT_BAY_H = LANE_LEAD + LANE_PITCH * (LANES - 1) + LANE_H

/** Breathing room between the last band and the counter's slab. */
const COUNTER_GAP = 8
const COUNTER_TOP = TOOLBAR_H + BELT_BAY_H + COUNTER_GAP
const SLAB_H = 22

/**
 * How far the panels sit below the counter's front edge. The strip of wood left
 * above them is what makes the panels read as standing *at* the counter rather
 * than as being part of it.
 */
const PANEL_INSET = 54
const PANEL_TOP = COUNTER_TOP + SLAB_H + PANEL_INSET
const PANEL_H = 190
const PANEL_FOOT = 14

const FRAME_HEIGHT = PANEL_TOP + PANEL_H + PANEL_FOOT

/**
 * The floor under the scale. Below this a price stops being readable and a tray
 * stops being a target, so the frame stops shrinking and the stage scrolls
 * instead — the same trade the Lesson makes at the same size.
 */
const MIN_FRAME_HEIGHT = 400
const MIN_SCALE = MIN_FRAME_HEIGHT / FRAME_HEIGHT

/** Flush to the frame's edges: a duct is a cut in the wall, not a fitting on it. */
const DUCT_W = 20

/**
 * How far the belt run is inset from each frame edge.
 *
 * This is what sets the pitch. The run is a fixed width and the server's
 * `slotCount` divides it, which is why `slotPitchPx` off the wire is now
 * advisory: the belt has to fill the room it is given, not the room the server
 * imagines. At eight slots this comes to the 148 pitch the layout was measured
 * at, carrying a 100-wide tray.
 */
const RUN_MARGIN = 48
const RUN_WIDTH = FRAME_WIDTH - RUN_MARGIN * 2

const PANEL_MARGIN = 20
const PANEL_GAP = 12

export function createBakeryGame({ playerId, config, game, onClaim, onExit }) {
    const slotCount = config.slotCount ?? 8
    const slotPitch = RUN_WIDTH / slotCount
    const hopMs = config.hopMs ?? HOP_MS

    /** `itemId -> tray instance`. The mirror the whole file exists for. */
    const trays = new Map()
    /** `beltId -> belt instance`. */
    const belts = new Map()
    /** A pair per lane, rebuilt with the belts they cover. */
    const ducts = []
    /** `playerId -> wallet instance`. */
    const wallets = new Map()

    let ended = null

    /* --------------------------------------------------------------- chrome */

    /*
     * Cells, not fills. The two meters read in opposite directions — one counts
     * towards something wanted, the other towards something feared — and they
     * differ by label and by position as well as by colour.
     */
    const servedMeter = createMeter({
        label: 'Items purchased',
        value: game.served,
        total: game.target,
        tone: 'good',
    })

    const wastedMeter = createMeter({
        label: 'Items wasted',
        value: game.wasted,
        total: game.wasteLimit,
        tone: 'waste',
    })

    const toolbar = el('div', { class: 'pc-game__toolbar', role: 'status' },
        [servedMeter.el, wastedMeter.el])

    /** The wall the belts run against. Scenery, and named by nothing. */
    const backroom = el('div', { class: 'pc-game__backroom', 'aria-hidden': 'true' })

    const beltLayer = el('div', { class: 'pc-game__belts' })

    /**
     * The ducts sit in their own layer *above* the belts, and that layering is
     * the entire point of them: it is what makes a belt run through the wall
     * rather than stop at it.
     */
    const ductLayer = el('div', { class: 'pc-game__ducts', 'aria-hidden': 'true' })

    const counter = createBakeryCounter({ top: COUNTER_TOP })

    const walletRow = el('div', { class: 'pc-game__base' })

    /**
     * Where a tray goes once it is off a belt and still has something to do.
     * Above the belts, so a tray flying to a wallet passes over the machinery
     * rather than under it.
     */
    const flightLayer = el('div', { class: 'pc-game__flights' })

    const overlay = el('div', { class: 'pc-game__overlay', hidden: true })

    /*
     * Bottom to top: wall, belts, the ducts they run through, the counter, the
     * players' panels, then the flight layer. A tray flying to a wallet has to
     * pass *over* the machinery and over the counter, which is the whole reason
     * the flight layer sits where it does.
     */
    const frame = el('div', { class: 'pc-game__frame' }, [
        backroom,
        toolbar,
        beltLayer,
        ductLayer,
        counter.el,
        walletRow,
        flightLayer,
        overlay,
    ])

    /*
     * The frame is scaled with a transform, which takes up no layout at all, so
     * the box centring and scrolling can see has to be this one — sized to what
     * the frame comes out as once scaled.
     */
    const fitBox = el('div', { class: 'pc-game__fit' }, frame)

    /*
     * The geometry lives on the stage, not on the frame, because `.pc-game__fit`
     * sits *between* them and has to multiply the design width by the scale.
     * Set on the frame, those properties would not be in scope for the very box
     * whose job is to predict the frame's footprint.
     */
    const root = el('section', {
        class: 'pc-game',
        style: {
            '--pc-game-width': `${FRAME_WIDTH}px`,
            '--pc-game-height': `${FRAME_HEIGHT}px`,
            '--pc-game-scale': '1',
            '--pc-game-toolbar': `${TOOLBAR_H}px`,
            '--pc-game-counter': `${COUNTER_TOP}px`,
            '--pc-game-base': `${PANEL_TOP}px`,
            '--pc-game-panel-margin': `${PANEL_MARGIN}px`,
            '--pc-game-panel-gap': `${PANEL_GAP}px`,
        },
    }, fitBox)

    /**
     * Fit the design box to the display, and keep fitting it.
     *
     * The same arrangement the Lesson uses, and for the same reason: this is a
     * fixed 1280x720 layout, so on any display smaller than that it either
     * scales or it hides half of itself behind a scrollbar. A child cannot tap
     * a tray that is off the side of the screen, and the fourth player cannot
     * see their own hand.
     *
     * Height leads, because the design is a stack of bands that has to add up.
     * Width holds a veto — a frame wider than the window puts the waste duct off
     * the edge. The floor beats both: below `MIN_FRAME_HEIGHT` the bakery stops
     * shrinking and the stage clips and scrolls instead, on the grounds that a
     * belt too small to read is no more use than one you have to scroll to.
     */
    let scale = 0

    function fit() {
        const { clientWidth, clientHeight } = root
        if (!clientWidth || !clientHeight) return

        const next = Math.max(
            MIN_SCALE,
            Math.min(clientHeight / FRAME_HEIGHT, clientWidth / FRAME_WIDTH),
        )

        // A scrollbar arriving or leaving changes the box that chose the scale,
        // which can otherwise chase itself round the observer a frame at a
        // time. Ignoring changes too small to see is what settles it.
        if (Math.abs(next - scale) < 0.002) return

        scale = next
        root.style.setProperty('--pc-game-scale', String(scale))
    }

    const resizes = new ResizeObserver(fit)
    resizes.observe(root)

    /* ---------------------------------------------------------------- build */

    /**
     * Where a lane sits. Fixed rows rather than a share of whatever space there
     * is, because the lanes *are* the layout: 72, 196 and 320, a `LANE_PITCH`
     * apart. Fewer than three belts centre in the bay, so a single belt lands on
     * the middle lane rather than at the top of an empty room.
     */
    function laneTop(index, count) {
        return TOOLBAR_H + LANE_LEAD + LANE_PITCH * (index + (LANES - count) / 2)
    }

    function buildBelts(list) {
        for (const belt of belts.values()) belt.destroy()
        for (const duct of ducts) duct.destroy()

        belts.clear()
        ducts.length = 0
        clear(beltLayer)
        clear(ductLayer)

        list.forEach((wire, index) => {
            const belt = createConveyorBelt({ slotWidth: slotPitch, slotCount })
            const top = laneTop(index, list.length)

            // A lane reserves room for a tray and its band, and the belt is what
            // actually decides how deep that is. Cheap to check, and the only
            // thing standing between a changed tray proportion and a duct that
            // stops short of the belt it is meant to swallow.
            if (Math.round(belt.height) !== LANE_H) {
                console.warn(
                    `[bakery] a belt at a ${Math.round(slotPitch)}px pitch is `
                    + `${Math.round(belt.height)}px deep, not the ${LANE_H}px a lane reserves`)
            }

            belt.el.classList.add('pc-game__belt', 'is-placed')
            belt.el.style.setProperty('--pc-belt-x', `${RUN_MARGIN}px`)
            belt.el.style.setProperty('--pc-belt-y', `${top}px`)

            belts.set(wire.id, belt)
            beltLayer.appendChild(belt.el)

            // One pair per lane, in the layer above. The belt runs behind both
            // and out into its own overscan, so a tray arrives from somewhere
            // and leaves for somewhere instead of blinking on at a frame edge.
            for (const [side, left] of [['in', 0], ['out', FRAME_WIDTH - DUCT_W]]) {
                const duct = createDuct({ side, height: belt.height })
                duct.el.style.left = `${left}px`
                duct.el.style.top = `${top}px`

                ducts.push(duct)
                ductLayer.appendChild(duct.el)
            }
        })
    }

    function buildWallets(players) {
        for (const wallet of wallets.values()) wallet.destroy()
        wallets.clear()
        clear(walletRow)

        const list = Object.values(players)

        /*
         * The panels share the base band out between them, which at four players
         * comes to the 301 the layout was measured at. Fewer players get wider
         * panels rather than a gap: a room of two should not look like a room of
         * four with two seats missing.
         *
         * The height is fixed, not derived from what is left below the counter —
         * it is the box the coin fit was computed against, and the strip of
         * counter showing under the panels is part of the picture.
         */
        const width = Math.floor(
            (FRAME_WIDTH - PANEL_MARGIN * 2 - PANEL_GAP * (list.length - 1)) / list.length)

        for (const player of list) {
            const wallet = createPlayerWallet({
                name: player.name,
                color: player.colorSlot,
                coins: player.coins ?? [],
                width,
                height: PANEL_H,
                gap: 10,
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
            // The belt decides how wide a tray is; asking it is what keeps the
            // two from drifting apart when the pitch changes.
            trayWidth: trayWidthFor(slotPitch),
            // Derived from the id rather than picked, because every player has
            // to see the same pastry on the same tray — four kids round a table
            // comparing screens is the actual test. See lib/goods.js.
            good: goodFor(wire.id),
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
            left: RUN_MARGIN + x - tray.width / 2,
            top: beltTop + y - tray.rideHeight,
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
        const scale = frameBox.width / FRAME_WIDTH || 1

        return {
            x: (walletBox.left + walletBox.width / 2 - frameBox.left) / scale - from.left,
            y: (walletBox.top - frameBox.top) / scale - from.top,
        }
    }

    /**
     * `total` is re-sent as well as `value`: a snapshot after a reconnect can
     * arrive with a different target than the one the meters were built with,
     * and a meter drawing ten cells for a game of eight is worse than no meter.
     */
    function setScores(next) {
        servedMeter.update({ value: next.served, total: next.target })
        wastedMeter.update({ value: next.wasted, total: next.wasteLimit })
    }

    function finish(payload) {
        ended = payload

        const won = payload.outcome === 'win'
        const mine = payload.results.players.find(one => one.id === playerId)

        clear(overlay)
        overlay.hidden = false
        overlay.classList.toggle('is-win', won)

        /*
         * The way out, under the score rather than over it: the numbers are
         * what the run was for, and a control placed above them is a control
         * pressed before they are read.
         */
        const exitButton = el('button', {
            type: 'button',
            class: 'pc-button pc-button--blue pc-game__exit',
            onClick: () => onExit?.(),
        }, 'Back to menu')

        append(overlay, [
            el('h2', {}, won
                ? 'Congratulations! Enjoy your bakery items.'
                : 'You and your friends wasted too much food and were asked to leave the bake sale.'),
            won ? createStarRating(starsFor(payload.results)) : null,
            el('p', {}, `You purchased ${payload.results.served} of ${payload.results.target}.`),
            mine ? el('p', {}, `You alone purchased ${mine.score}.`) : null,
            exitButton,
        ])

        // The game ends on its own, so nobody touched a control to get here and
        // the focus has to be moved by hand — the same reason the lesson's last
        // card moves it. The button is the only thing left to do.
        exitButton.focus()
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
            resizes.disconnect()

            for (const tray of trays.values()) tray.destroy()
            for (const belt of belts.values()) belt.destroy()
            for (const duct of ducts) duct.destroy()
            for (const wallet of wallets.values()) wallet.destroy()

            servedMeter.destroy()
            wastedMeter.destroy()
            counter.destroy()

            trays.clear()
            belts.clear()
            wallets.clear()
            ducts.length = 0

            root.remove()
        },
    }
}

/* --------------------------------------------------------------- the rating */

/** Filled out of this many. Three is what a K-2 kid already reads as a score. */
const STAR_TOTAL = 3

/**
 * A win's star rating, read off the shared waste budget.
 *
 * Waste is the only thing a *winning* team can still have done badly — the
 * target was hit either way, so serving is not what separates a good run from
 * a scraped one. A team that reached the target having filled three quarters
 * of the incinerator got there by grabbing at everything; one that barely
 * touched it counted before it grabbed, which is the whole exercise.
 */
function starsFor({ wasted, wasteLimit }) {
    const spoiled = wasteLimit > 0 ? wasted / wasteLimit : 0

    if (spoiled >= 0.75) return 1
    if (spoiled >= 0.25) return 2
    return STAR_TOTAL
}

/**
 * The rating, as `count` filled stars followed by empty ones.
 *
 * Earned and unearned differ in fill *and* in outline weight, never in colour
 * alone, and the row is one `role="img"` carrying the whole result in words —
 * three gold shapes in a line say nothing to a child who cannot see them, and
 * "2 out of 3 stars" is the entire outcome in four.
 */
function createStarRating(count, total = STAR_TOTAL) {
    const stars = []

    for (let i = 0; i < total; i += 1) {
        stars.push(svg('svg', {
            class: ['pc-game__star', i < count ? 'is-earned' : null],
            viewBox: '-52 -52 104 104',
            'aria-hidden': 'true',
        }, svg('polygon', { points: starPoints(48) })))
    }

    return el('div', {
        class: 'pc-game__stars',
        role: 'img',
        'aria-label': `${count} out of ${total} stars`,
    }, stars)
}
