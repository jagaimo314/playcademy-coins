/**
 * Manual test page for the baked goods and the trays they stand on.
 *
 * Served by Vite at /src/components/test/goods.html. Not part of the app:
 * nothing imports this, and no route points at it.
 *
 * This page exists to catch one failure cheaply. The six goods are raster
 * cutouts of different proportions fitted to one box, so the thing that goes
 * wrong is a good hovering above its deck or sinking into it — and finding that
 * out here costs a page refresh, where finding it out on the assembled floor
 * costs the whole Bakery. Look along the deck line, at 1:1 and at 4×.
 */
import '../../styles/base.css'
import './goods.css'

import { append, el, svg } from '../../lib/dom.js'
import { GOODS, GOOD_ART, goodFor } from '../../lib/goods.js'
import { formatCents } from '../../lib/money.js'
import { createBakeryCounter } from '../bakery-counter/bakery-counter.js'
import { createConveyorBelt } from '../conveyor-belt/conveyor-belt.js'
import { createConveyorItem, TRAY_RIDE_ASPECT } from '../conveyor-item/conveyor-item.js'
import { createDuct } from '../duct/duct.js'

/** The mockup's tray, so "1:1" on this page is life size on the bakery floor. */
const TRAY_W = 100

/** The mockup's belt: eight slots at a 148 pitch, duct to duct across 1280. */
const SLOT_PITCH = 148
const SLOT_COUNT = 8

/*
 * A slice of the real frame, at the real numbers, so what this page shows is
 * what the floor will show. The view owns these for real at M5; here they are
 * only enough to hang one lane and the counter on.
 */
const FRAME_W = 1280
const DUCT_W = 20
const LANE_TOP = 196          /* the middle lane */
const COUNTER_TOP = 440
const RUN_X = 2               /* slot 0's left edge, just inside the oven duct */


/** A price per good, so each tray reads as a tray rather than a swatch. */
const PRICES = [31, 45, 28, 52, 19, 37]

const page = document.getElementById('test')

append(page, [
    el('header', { class: 'pc-test-header' }, [
        el('h1', {}, 'Baked goods'),
        el('p', {}, 'Every good on its tray, at 1:1 and at 4×, then a belt of eight.'),
    ]),
    traySection(1),
    traySection(4),
    beltSection(),
])

/*
 * Appended in a second pass, after everything above is in the document.
 *
 * Half of what is worth checking here is where things land relative to each
 * other — whether the band really runs *behind* a duct rather than merely near
 * one — and none of that has a position until it is in a document. Done
 * synchronously rather than from a `requestAnimationFrame`: a frame callback
 * never fires in a backgrounded tab, so the checks would silently report
 * nothing at all on a page opened in a tab that was not looked at yet.
 */
append(page, checksSection())

/* ---------------------------------------------------------------------------
 * Every good on a tray, at one magnification.
 * ------------------------------------------------------------------------- */
function traySection(zoom) {
    const trays = GOODS.map((good, index) => {
        const price = PRICES[index % PRICES.length]
        const tray = createConveyorItem({ price, trayWidth: TRAY_W, good })

        return el('figure', {}, [
            deckLineFrame(tray, zoom),
            el('figcaption', {}, [
                el('b', {}, good),
                ` · ${formatCents(price)}`,
                GOOD_ART[good].scale === 1 ? null : el('i', {}, ` ×${GOOD_ART[good].scale}`),
            ]),
        ])
    })

    return el('section', { class: 'pc-card pc-stack' }, [
        el('h2', {}, zoom === 1 ? 'Trays at 1:1' : `Trays at ${zoom}×`),
        el('div', { class: ['pc-test-goods', zoom > 1 && 'is-zoomed'] }, trays),
        el('p', { class: 'pc-test-caption' }, zoom === 1
            ? 'Prices must be legible at this size — this is how big a tray really is.'
            : 'The red rule is the deck surface. Every good must reach it — a cutout with '
                + 'transparent padding beneath it places correctly and still floats.'),
    ])
}

/* ---------------------------------------------------------------------------
 * A belt of eight, duct to duct, above the counter — the bakery's own geometry
 * at life size, without the game wired to it.
 * ------------------------------------------------------------------------- */
function beltSection() {
    const belt = createConveyorBelt({ slotWidth: SLOT_PITCH, slotCount: SLOT_COUNT })

    belt.setSlotItems(Array.from({ length: SLOT_COUNT }, (_, slot) => createConveyorItem({
        price: PRICES[slot % PRICES.length] + slot,
        trayWidth: belt.trayWidth,
        good: goodFor(`goods-page-${slot}`),
    })))

    belt.el.classList.add('is-placed')
    belt.el.style.setProperty('--pc-belt-x', `${RUN_X}px`)
    belt.el.style.setProperty('--pc-belt-y', `${LANE_TOP}px`)

    // One pair per lane, flush to the frame's edges. Mounted in a layer above
    // the belt, which is the whole job: the belt has to run *behind* them.
    const ducts = [
        { side: 'in', left: 0 },
        { side: 'out', left: FRAME_W - DUCT_W },
    ].map(({ side, left }) => {
        const duct = createDuct({ side, height: belt.height })
        duct.el.style.left = `${left}px`
        duct.el.style.top = `${LANE_TOP}px`
        return duct.el
    })

    const counter = createBakeryCounter({ top: COUNTER_TOP })

    const frame = el('div', { class: 'pc-test-frame' }, [
        el('div', { class: 'pc-test-backroom' }),
        el('div', { class: 'pc-test-belts' }, belt.el),
        el('div', { class: 'pc-test-ducts' }, ducts),
        counter.el,
    ])

    return el('section', { class: 'pc-card pc-stack' }, [
        el('h2', {}, 'A belt of eight, in the room'),
        el('div', { class: 'pc-test-stage' }, frame),
        el('p', { class: 'pc-test-caption' }, [
            'Eight slots at a ',
            el('code', {}, String(SLOT_PITCH)),
            ' pitch, running duct to duct. The band disappears past both ends rather ',
            'than stopping at them, and the two duct ends stay tellable apart in ',
            'greyscale. Six goods over eight slots repeat, and that is expected — the ',
            'price is what identifies a tray, not the picture.',
        ]),
    ])
}

/* ---------------------------------------------------------------------------
 * Self-checks. Geometry only: whether a good *looks* right on its deck is what
 * the eye above is for, but whether it is placed to is arithmetic.
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

    const imageOf = tray => tray.el.querySelector('.pc-tray__good')

    check('the set is six goods and every one has art', () => {
        if (GOODS.length !== 6) return `${GOODS.length} goods`
        for (const good of GOODS) {
            if (!GOOD_ART[good]?.url) return `${good} has no url`
            if (!(GOOD_ART[good].scale > 0)) return `${good} has scale ${GOOD_ART[good]?.scale}`
        }
    })

    check('an unknown good throws rather than drawing nothing', () => {
        if (!threw(() => createConveyorItem({ price: 10, good: 'baguette' }))) return 'no throw'
    })

    // The whole point of the page. Every good's box bottom must land on the same
    // line whatever its scale, because that line is the deck it stands on.
    check('every good stands on the deck line, whatever its scale', () => {
        for (const good of GOODS) {
            const tray = createConveyorItem({ price: 20, trayWidth: TRAY_W, good })
            const image = imageOf(tray)
            const base = Number(image.getAttribute('y')) + Number(image.getAttribute('height'))
            const detail = expect(base, 0.72 * TRAY_W, `${good} base`)
            tray.destroy()
            if (detail) return detail
        }
    })

    check('a scaled good keeps its box centred', () => {
        const tray = createConveyorItem({ price: 20, trayWidth: TRAY_W, good: 'macaron' })
        const image = imageOf(tray)
        const x = Number(image.getAttribute('x'))
        const width = Number(image.getAttribute('width'))
        const detail = expect(x + width / 2, TRAY_W / 2, 'centre')
        tray.destroy()
        return detail
    })

    check('the macaron is drawn smaller than the pie', () => {
        const small = createConveyorItem({ price: 20, trayWidth: TRAY_W, good: 'macaron' })
        const large = createConveyorItem({ price: 20, trayWidth: TRAY_W, good: 'pie' })
        const smallWidth = Number(imageOf(small).getAttribute('width'))
        const largeWidth = Number(imageOf(large).getAttribute('width'))
        small.destroy()
        large.destroy()
        if (!(smallWidth < largeWidth)) return `macaron ${smallWidth}, pie ${largeWidth}`
    })

    check('the good is drawn with href, not xlink:href', () => {
        const tray = createConveyorItem({ price: 20, trayWidth: TRAY_W, good: 'cake' })
        const image = imageOf(tray)
        const hasHref = image.hasAttribute('href')
        const hasXlink = image.hasAttributeNS('http://www.w3.org/1999/xlink', 'href')
        tray.destroy()
        if (!hasHref) return 'no href'
        if (hasXlink) return 'xlink:href set as well'
    })

    check('a tray with no good still renders and still prices', () => {
        const tray = createConveyorItem({ price: 42, trayWidth: TRAY_W })
        const image = imageOf(tray)
        const priced = tray.el.querySelector('.pc-tray__price').textContent
        const hasHref = image.hasAttribute('href')
        tray.destroy()
        if (hasHref) return 'href set with no good'
        return expect(priced, '42¢', 'price')
    })

    check('re-dressing a tray swaps the art in place', () => {
        const tray = createConveyorItem({ price: 20, trayWidth: TRAY_W, good: 'cake' })
        const image = imageOf(tray)
        const before = image.getAttribute('href')
        tray.update({ good: 'brownie' })
        const after = imageOf(tray).getAttribute('href')
        const sameNode = imageOf(tray) === image
        tray.destroy()
        if (!sameNode) return 'the image node was replaced'
        if (before === after) return 'the art did not change'
    })

    check('the deck line is the tray ride height, and the card hangs below it', () => {
        const tray = createConveyorItem({ price: 20, trayWidth: TRAY_W, good: 'pie' })
        const detail = expect(tray.rideHeight, TRAY_RIDE_ASPECT * TRAY_W, 'rideHeight')
        const hangs = tray.height > tray.rideHeight
        tray.destroy()
        if (detail) return detail
        if (!hangs) return 'the card does not overhang the deck'
    })

    /* ------------------------------------------------------- the room */

    // Frame-relative, so these read as the numbers the mockup is specified in.
    const frame = document.querySelector('.pc-test-frame')
    const box = frame.getBoundingClientRect()
    const edge = Number(getComputedStyle(frame).borderLeftWidth.replace('px', ''))
    const span = node => {
        const rect = node.getBoundingClientRect()
        return {
            left: Math.round(rect.left - box.left - edge),
            right: Math.round(rect.right - box.left - edge),
            top: Math.round(rect.top - box.top - edge),
            bottom: Math.round(rect.bottom - box.top - edge),
        }
    }

    const ductNodes = [...frame.querySelectorAll('.pc-duct')]
    const bandNode = frame.querySelector('.pc-belt__band')

    check('a duct is 20 wide and flush to its frame edge', () => {
        const [into, out] = ductNodes.map(span)
        if (into.left !== 0) return `oven duct at ${into.left}`
        if (into.right - into.left !== DUCT_W) return `oven duct ${into.right - into.left} wide`
        if (out.right !== FRAME_W) return `waste duct ends at ${out.right}`
    })

    check('a duct is exactly as deep as the belt it covers', () => {
        const belt = frame.querySelector('.pc-belt')
        const bandBottom = span(bandNode).bottom
        for (const node of ductNodes) {
            const rect = span(node)
            if (rect.top !== LANE_TOP) return `duct top ${rect.top}`
            if (rect.bottom !== bandBottom) return `duct ends at ${rect.bottom}, band at ${bandBottom}`
        }
        if (!belt) return 'no belt'
    })

    // The whole job of a duct. A belt that stops at one is a belt that comes
    // from nowhere; a belt that runs through is a belt with an oven behind it.
    check('the band runs behind both ducts and off the frame', () => {
        const band = span(bandNode)
        if (band.left >= 0) return `band starts at ${band.left}, inside the frame`
        if (band.right <= FRAME_W) return `band ends at ${band.right}, inside the frame`
    })

    // Not by side alone: the two ends of a belt mean opposite things, and one
    // of them has to still read that way to a child who cannot see colour.
    check('the two duct ends differ, and differ in brightness', () => {
        const [into, out] = ductNodes.map(node =>
            getComputedStyle(node.firstElementChild).backgroundColor)
        if (into === out) return 'both lips are the same colour'

        const grey = colour => {
            const [r, g, b] = colour.match(/\d+/g).map(Number)
            return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        if (Math.abs(grey(into) - grey(out)) < 40) {
            return `too close in greyscale: ${grey(into).toFixed(0)} vs ${grey(out).toFixed(0)}`
        }
    })

    check('a duct says nothing — the belt already names itself', () => {
        for (const node of ductNodes) {
            if (node.getAttribute('aria-hidden') !== 'true') return 'a duct is not aria-hidden'
        }
    })

    // One number, spent twice. A second copy of the slab's depth in CSS is how
    // a hairline of wall opens up between the counter's two halves.
    check('the counter face starts exactly where the slab ends', () => {
        const slab = span(frame.querySelector('.pc-counter__top'))
        const face = span(frame.querySelector('.pc-counter__face'))
        if (slab.top !== COUNTER_TOP) return `slab at ${slab.top}`
        return expect(face.top, slab.bottom, 'face top')
    })

    check('the counter bleeds past both frame edges', () => {
        for (const part of ['.pc-counter__top', '.pc-counter__face']) {
            const rect = span(frame.querySelector(part))
            if (rect.left >= 0 || rect.right <= FRAME_W) return `${part} does not bleed`
        }
    })

    check('goodFor is stable, and spreads over the whole set', () => {
        const ids = Array.from({ length: 200 }, (_, i) => `item-${i}`)
        const seen = new Set(ids.map(goodFor))
        for (const id of ids) {
            if (goodFor(id) !== goodFor(id)) return `${id} is not stable`
            if (!GOODS.includes(goodFor(id))) return `${id} gave ${goodFor(id)}`
        }
        if (seen.size !== GOODS.length) return `only ${seen.size} of ${GOODS.length} goods appeared`
    })

    return results
}

/* ------------------------------------------------------------------ helpers */

/**
 * A tray is an SVG group, so on its own it needs a canvas to sit in.
 *
 * The canvas carries a rule across the deck's *top* — the surface a good
 * actually stands on — which is the one thing this page is for. The geometry is
 * already covered by the checks below; what a rule catches that arithmetic
 * cannot is a cutout with transparent padding under it, which places correctly
 * and still floats. Read off the drawn deck rather than recomputed, so the rule
 * cannot agree with a tray that has moved.
 */
function deckLineFrame(item, zoom) {
    const pad = 4
    const deckLine = Number(item.el.querySelector('.pc-tray__deck').getAttribute('y'))

    return svg('svg', {
        class: 'pc-test-tray',
        viewBox: `${-pad} ${-pad} ${item.width + pad * 2} ${item.height + pad * 2}`,
        width: (item.width + pad * 2) * zoom,
        height: (item.height + pad * 2) * zoom,
        role: 'img',
        'aria-label': item.el.getAttribute('aria-label'),
    }, [
        item.el,
        // Over the tray, not behind it. Behind, the deck hides the very line the
        // good has to be judged against.
        svg('line', {
            class: 'pc-test-deckline',
            x1: -pad,
            y1: deckLine,
            x2: item.width + pad,
            y2: deckLine,
        }),
    ])
}
