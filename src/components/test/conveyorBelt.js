/**
 * Manual test page for the conveyor belt and the trays it carries.
 *
 * Served by Vite at /src/components/test/conveyorBelt.html. Not part of the
 * app: nothing imports this, and no route points at it.
 */
import '../../styles/base.css'
import './conveyorBelt.css'

import { append, el, svg } from '../../lib/dom.js'
import { formatCents } from '../../lib/money.js'
import { goodFor } from '../../lib/goods.js'
import { createConveyorBelt } from '../conveyor-belt/conveyor-belt.js'
import { createConveyorItem, TRAY_FULL_ASPECT, TRAY_RIDE_ASPECT } from '../conveyor-item/conveyor-item.js'

/** 10 slots at 120 units each — the 1200-unit belt the bakery layout assumes. */
const SLOT_WIDTH = 120
const SLOT_COUNT = 10

/** Slot -> price. A few trays, spread out, so the empty slots are visible too. */
const DEFAULT_LAYOUT = { 0: 25, 2: 10, 3: 35, 6: 5, 8: 50 }

/** Spawn prices, cycled rather than random so the page replays the same way. */
const PRICE_POOL = [15, 40, 30, 5, 75, 20, 60, 45]

append(document.getElementById('test'), [
    el('header', { class: 'pc-test-header' }, [
        el('h1', {}, 'Conveyor belt'),
        el('p', {}, 'A 1200-unit belt of 10 slots, carrying trays. Tap a tray to choose it.'),
    ]),
    beltSection(),
    traySection(),
    checksSection(),
])

/* ---------------------------------------------------------------------------
 * The belt itself.
 * ------------------------------------------------------------------------- */
function beltSection() {
    const readout = el('p', { class: 'pc-test-readout' })
    const belt = createConveyorBelt({ slotWidth: SLOT_WIDTH, slotCount: SLOT_COUNT })

    let chosen = null
    let spawns = 0

    function makeTray(price) {
        const tray = createConveyorItem({
            price,
            trayWidth: belt.trayWidth,
            // Derived from an id, as the real view does it, so the same tray
            // always wears the same pastry.
            good: goodFor(`test-${price}-${spawns}`),
            onClick: () => choose(tray),
        })

        return tray
    }

    /** Tapping the chosen tray again lets it go, which is what a kid expects. */
    function choose(tray) {
        chosen?.update({ selected: false })
        chosen = tray === chosen ? null : tray
        chosen?.update({ selected: true })
        showChoice()
    }

    function showChoice() {
        readout.textContent = chosen
            ? `Chosen: ${formatCents(chosen.price)} in slot ${belt.slotItems.indexOf(chosen)}`
            : 'Nothing chosen'
    }

    function load() {
        for (const tray of belt.slotItems) tray?.destroy()
        chosen = null
        spawns = 0

        belt.setSlotItems(Array.from({ length: SLOT_COUNT }, (_, slot) =>
            (slot in DEFAULT_LAYOUT ? makeTray(DEFAULT_LAYOUT[slot]) : null)))

        showChoice()
    }

    /**
     * One advance beat: everything shifts a slot towards the mouth and a fresh
     * tray lands in slot 0. Whatever fell off the end is disposed of here —
     * `setSlotItems` only *detaches* what has left, because a claimed tray
     * still has an animation to fly through, so destroying it is the caller's
     * job. This is what that looks like.
     *
     * The jam rule (a tray holds when the slot ahead is occupied) belongs to
     * the server; a straight shift is enough to exercise re-placement.
     */
    function advance() {
        const current = belt.slotItems
        const leaving = current[SLOT_COUNT - 1]

        // Animated, because the hop is the thing worth looking at here: a tray
        // that was not on the belt a moment ago has to ride in from off-stage
        // rather than appear in slot 0, and that is only visible on a beat.
        belt.setSlotItems([
            makeTray(PRICE_POOL[spawns++ % PRICE_POOL.length]),
            ...current.slice(0, -1),
        ], { animate: true })

        if (leaving) {
            if (leaving === chosen) chosen = null
            leaving.destroy()
        }

        showChoice()
    }

    /** Standing in for a claim: the tray leaves the belt and is gone. */
    function grab() {
        if (!chosen) return

        belt.setSlotItems(belt.slotItems.map(tray => (tray === chosen ? null : tray)))
        chosen.destroy()
        chosen = null
        showChoice()
    }

    load()

    return el('section', { class: 'pc-card pc-stack' }, [
        el('h2', {}, 'Belt with trays'),
        readout,
        belt.el,
        el('div', { class: 'pc-test-controls' }, [
            button('Advance one slot', advance),
            button('Grab chosen tray', grab, true),
            button('Reset belt', load, true),
        ]),
        el('p', { class: 'pc-test-caption' }, [
            'Drawn at ',
            el('code', {}, `${belt.width} × ${Math.round(belt.height)}`),
            ' user units and scaled to fit. Trays are ',
            el('code', {}, String(belt.trayWidth)),
            ' wide, centred in their slot.',
        ]),
    ])
}

/* ---------------------------------------------------------------------------
 * Trays on their own, at a few widths.
 * ------------------------------------------------------------------------- */
function traySection() {
    const samples = [
        { price: 5, trayWidth: 80, good: 'macaron' },
        { price: 25, trayWidth: 120, good: 'cupcake' },
        { price: 42, trayWidth: 160, good: 'tart' },
        { price: 99, trayWidth: 200, good: 'pie' },
    ]

    return el('section', { class: 'pc-card pc-stack' }, [
        el('h2', {}, 'Trays'),
        el('div', { class: 'pc-test-trays' }, samples.map(({ price, trayWidth, good }) => el('figure', {}, [
            svgFrame(createConveyorItem({ price, trayWidth, good })),
            el('figcaption', {}, `${formatCents(price)} at trayWidth ${trayWidth}`),
        ]))),
        el('p', { class: 'pc-test-caption' }, [
            'One number — ',
            el('code', {}, 'trayWidth'),
            ' — scales the whole tray. The good is fitted to its box and stood on the ',
            'deck, so a macaron and a pie both rest on the board rather than in it.',
        ]),
    ])
}

/* ---------------------------------------------------------------------------
 * Geometry and lifecycle self-checks.
 * ------------------------------------------------------------------------- */
function checksSection() {
    const list = el('ul', { class: 'checks' })
    const summary = el('p', { class: 'pc-test-readout' })

    const results = runChecks()
    const passed = results.filter(result => result.ok).length

    summary.textContent = `${passed} of ${results.length} checks passed`
    summary.style.color = passed === results.length ? 'var(--pc-green-ink)' : 'var(--pc-red-deep)'

    append(list, results.map(({ ok, name, detail }) => el('li', {}, [
        el('span', { class: ok ? 'is-pass' : 'is-fail' }, ok ? '✓' : '✗'),
        el('span', {}, name),
        detail ? el('span', { class: 'checks__detail' }, `— ${detail}`) : null,
    ])))

    return el('section', { class: 'pc-card pc-stack' }, [
        el('h2', {}, 'Self-checks'),
        summary,
        list,
    ])
}

function runChecks() {
    const results = []

    const check = (name, fn) => {
        try {
            const detail = fn()
            results.push({ name, ok: detail === undefined, detail: detail ?? '' })
        } catch (error) {
            results.push({ name, ok: false, detail: error.message })
        }
    }

    /** Returns a message on mismatch, which `check` treats as a failure. */
    const expect = (actual, wanted, label) => {
        const a = JSON.stringify(actual)
        const w = JSON.stringify(wanted)
        if (a !== w) return `${label}: got ${a}, wanted ${w}`
        return undefined
    }

    const threw = fn => {
        try {
            fn()
            return false
        } catch {
            return true
        }
    }

    // A belt of its own, so the checks cannot disturb the one on show.
    const belt = createConveyorBelt({ slotWidth: SLOT_WIDTH, slotCount: SLOT_COUNT })
    const tray = createConveyorItem({ price: 35, trayWidth: belt.trayWidth })

    check('belt spans slotWidth × slotCount', () => expect(belt.width, 1200, 'width'))

    check('slot 0 centres half a slot in', () => expect(belt.slotCenter(0).x, 60, 'x'))

    check('the last slot centres half a slot from the end', () =>
        expect(belt.slotCenter(SLOT_COUNT - 1).x, 1140, 'x'))

    check('every slot sits on the same belt surface', () =>
        expect(belt.slotCenter(0).y, belt.slotCenter(7).y, 'y'))

    check('a slot outside the belt throws', () => {
        if (!threw(() => belt.slotCenter(SLOT_COUNT))) return 'no throw on slot 10'
        if (!threw(() => belt.slotCenter(-1))) return 'no throw on slot -1'
    })

    // Off-stage is reachable by name, and only by name. `bakery-game.js`
    // positions a flight from `slotCenter()`, so it has to keep refusing an
    // index that is not a slot rather than quietly answering with the overscan.
    check('entry sits off-stage before slot 0, exit after the last', () => {
        if (!(belt.entryCenter().x < 0)) return `entry at ${belt.entryCenter().x}`
        if (!(belt.exitCenter().x > belt.width)) return `exit at ${belt.exitCenter().x}`
    })

    check('off-stage is level with the belt surface', () => {
        if (belt.entryCenter().y !== belt.slotCenter(0).y) return 'entry is off the band'
        if (belt.exitCenter().y !== belt.slotCenter(0).y) return 'exit is off the band'
    })

    check('the drawing overruns the run at both ends', () => {
        const [minX, , boxWidth] = belt.el.getAttribute('viewBox').split(' ').map(Number)
        if (!(minX < 0)) return `viewBox starts at ${minX}`
        if (!(minX + boxWidth > belt.width)) return `viewBox ends at ${minX + boxWidth}`
    })

    check('the band runs past both ends of the run', () => {
        const band = belt.el.querySelector('.pc-belt__band')
        const x = Number(band.getAttribute('x'))
        if (!(x < 0)) return `band starts at ${x}`
        if (!(x + Number(band.getAttribute('width')) > belt.width)) return 'band stops inside the run'
    })

    check('the belt reserves a tray plus the band', () => {
        const band = belt.height - TRAY_RIDE_ASPECT * belt.trayWidth
        if (!(band > 0)) return `band depth ${band}`
    })

    check('an empty belt reports no trays', () =>
        expect(belt.el.getAttribute('aria-label'), 'Conveyor belt, 10 slots, 0 trays', 'label'))

    check('tray height follows TRAY_FULL_ASPECT', () =>
        expect(tray.height, TRAY_FULL_ASPECT * belt.trayWidth, 'height'))

    check('a price must be whole cents', () => {
        if (!threw(() => createConveyorItem({ price: 12.5 }))) return 'no throw on 12.5'
        if (!threw(() => createConveyorItem({ price: -1 }))) return 'no throw on -1'
    })

    belt.setSlotItems([null, null, tray])

    check('a tray is centred over its slot, standing on the belt', () => {
        // Read off `style`, not the presentation attribute: the hop animates the
        // CSS property, so that is where a tray's position now lives.
        const { x, y } = belt.slotCenter(2)
        return expect(tray.el.style.transform,
            `translate(${x - tray.width / 2}px, ${y - tray.rideHeight}px)`, 'transform')
    })

    check('itemAt finds the tray, and nothing in an empty slot', () => {
        if (belt.itemAt(2) !== tray) return 'slot 2 is not the tray'
        if (belt.itemAt(0) !== null) return 'slot 0 is not empty'
    })

    check('occupancy is reported in the accessible name', () =>
        expect(belt.el.getAttribute('aria-label'), 'Conveyor belt, 10 slots, 1 tray', 'label'))

    check('slotItems hands back a copy', () => {
        const taken = belt.slotItems
        taken[2] = null
        if (belt.itemAt(2) !== tray) return 'mutating the copy changed the belt'
    })

    check('a tray moving slots is repositioned, not detached', () => {
        belt.setSlotItems([tray])
        if (belt.itemAt(0) !== tray) return 'tray did not move to slot 0'
        if (tray.el.parentNode === null) return 'tray was detached by a move'
    })

    check('a tray that leaves is detached, not destroyed', () => {
        belt.setSlotItems([])
        if (tray.el.parentNode !== null) return 'still attached'
        return expect(tray.price, 35, 'price after leaving')
    })

    check('more items than slots throws', () => {
        if (!threw(() => belt.setSlotItems(new Array(SLOT_COUNT + 1).fill(null)))) return 'no throw'
    })

    check('repricing updates the print and the name', () => {
        tray.update({ price: 60 })
        if (tray.el.querySelector('.pc-tray__price').textContent !== '60¢') return 'price not redrawn'
        return expect(tray.el.getAttribute('aria-label'), 'Tray, 60¢', 'label')
    })

    check('a chosen tray says so as well as showing it', () => {
        tray.update({ selected: true })
        return expect(tray.el.getAttribute('aria-label'), 'Tray, 60¢, chosen', 'label')
    })

    check('destroying a belt takes its trays with it', () => {
        const doomed = createConveyorItem({ price: 5 })
        const scratch = createConveyorBelt({ slotCount: 2, slotItems: [doomed] })

        scratch.destroy()
        if (doomed.el.parentNode !== null) return 'the tray survived its belt'
    })

    tray.destroy()
    belt.destroy()

    return results
}

/* ------------------------------------------------------------------ helpers */

/** A tray is an SVG group, so on its own it needs a canvas to sit in. */
function svgFrame(item) {
    return svg('svg', {
        viewBox: `-3 -3 ${item.width + 6} ${item.height + 6}`,
        width: item.width + 6,
        height: item.height + 6,
        role: 'presentation',
    }, item.el)
}

function button(label, onClick, quiet = false) {
    return el('button', {
        type: 'button',
        class: ['pc-test-btn', quiet && 'pc-test-btn--quiet'],
        onClick,
    }, label)
}
