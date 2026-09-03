import { animationSettled, prefersReducedMotion, svg } from '../../lib/dom.js'
import { TRAY_RIDE_ASPECT } from '../conveyor-item/conveyor-item.js'
import './conveyor-belt.css'

/** Stroke room, so the band's outline is not clipped by the viewBox edge. */
const PAD = 3

/** Room under the band for the shadow it casts onto the wall behind it. */
const CAST = 9

/**
 * How long a tray takes to hop one slot.
 *
 * Short on purpose. The server advances the belt instantaneously and the tray
 * then *rests* for the remainder of the interval — 1 to 2.7 seconds depending on
 * difficulty — and that resting period is the whole point of a stepped belt: a
 * second grader aiming at a stationary tray is aiming at a target rather than
 * leading a moving one. A leisurely hop would spend that stillness.
 *
 * The server quotes its own `hopMs` in `room/state`; this is the default when
 * nobody says otherwise.
 */
export const HOP_MS = 260

/**
 * How much of a slot a tray fills. The remainder is the gap that makes one slot
 * read as separate from the next — without it a full belt is a solid wall of
 * trays and no child can tell which one they are pointing at.
 *
 * The mockup's numbers: a 100-wide tray at a 148 pitch.
 */
const TRAY_FIT = 100 / 148

/**
 * Depth of the band, as a fraction of the *tray* rather than of the slot. The
 * band was chosen against the tray it carries — 26 deep under a 100 tray — and
 * tying it to the slot instead would let a change of pitch alone thicken it.
 */
const BAND = 0.26

/** The band's corner, likewise against the tray: 10 on the mockup's 100. */
const BAND_RADIUS = 0.1

/**
 * Below this the price stops being readable across a classroom, which is the
 * one thing a tray exists to do. Warned about rather than clamped: the caller
 * owns the layout, and silently drawing something other than what it asked for
 * would hide the problem rather than report it.
 */
const MIN_LEGIBLE_TRAY = 70

/**
 * A conveyor belt: a band, and an ordered row of slots along it, each holding
 * at most one tray.
 *
 * Slots rather than positions is the whole point, and it mirrors the server —
 * `docs/bakery-backend-plan.md` has a belt as an ordered array of slots, with
 * every advance moving trays one slot along on a beat. Nothing here interpolates
 * a position, because there is no position to interpolate: a tray is in a slot
 * or it is not, and the client is *told* the occupancy rather than predicting
 * it. Mapping a slot index into pixels is this component's only geometry job.
 *
 * Presentational: it draws what it is handed. The backend owns which tray sits
 * in which slot, and the view passes that down through `setSlotItems()`.
 */
export function createConveyorBelt({
    /** Width of one slot, in user units. The run spans `slotWidth * slotCount`. */
    slotWidth = 120,
    /** Slots visible along the belt, indexed 0 at the oven to `slotCount - 1` at the mouth. */
    slotCount = 8,
    /**
     * The trays on the belt: a `createConveyorItem()` instance per occupied
     * slot, `null` for an empty one. Shorter arrays leave the tail empty.
     */
    slotItems = [],
} = {}) {
    assertPositiveInt(slotCount, 'slotCount')
    if (!(slotWidth > 0)) throw new RangeError(`slotWidth must be > 0, got ${slotWidth}`)

    /** The slots themselves — what `slotCenter()` and every caller measure by. */
    const width = slotWidth * slotCount

    /**
     * Drawing room beyond each end of the run, one whole slot of it.
     *
     * This is what gives a fresh bake somewhere to come from. The belt is an
     * `<svg>` with a viewBox, so anything drawn outside that box is hard-clipped
     * by it — which is why a new tray used to have to fade in where it stood
     * rather than slide in, and why the slide read as a bar growing out of the
     * left edge when it was tried. With a slot of overscan there is an off-stage
     * for a tray to start in, and the overscan itself hangs off the frame, so
     * the part of the slide that is not yet honest happens where nobody sees it.
     */
    const overscan = slotWidth

    const trayWidth = Math.round(TRAY_FIT * slotWidth)
    const bandHeight = BAND * trayWidth

    /**
     * Headroom reserved above the band. Fixed at the belt's nominal tray size
     * rather than measured from whatever is currently on it — a belt that
     * changed height as trays came and went would shove the rest of the bakery
     * around on every beat.
     */
    const deckY = TRAY_RIDE_ASPECT * trayWidth
    const height = deckY + bandHeight

    if (trayWidth < MIN_LEGIBLE_TRAY) {
        console.warn(
            `[bakery] ${slotCount} slots at ${slotWidth}px give a ${trayWidth}px tray, `
            + `under the ${MIN_LEGIBLE_TRAY}px at which a price stays readable across a room`)
    }

    let slots = new Array(slotCount).fill(null)

    /*
     * Boundaries, not centres: the ticks a child counts trays between. Drawn
     * across the overscan as well, so the band a tray slides in on is visibly
     * the same belt it ends up resting on.
     */
    const firstDivider = -Math.ceil(overscan / slotWidth)
    const lastDivider = slotCount + Math.ceil(overscan / slotWidth)
    const dividers = []
    for (let i = firstDivider; i <= lastDivider; i += 1) {
        dividers.push(svg('line', {
            class: 'pc-belt__divider',
            x1: i * slotWidth,
            y1: deckY,
            x2: i * slotWidth,
            y2: deckY + bandHeight,
        }))
    }

    /*
     * Direction of travel, which nothing else on the belt says. Inset clear of
     * both ends and never drawn in the overscan, so no chevron is half-eaten by
     * a duct at a frame edge.
     */
    const arrowY = deckY + bandHeight / 2
    const arrowSize = bandHeight * 0.22
    const arrows = Array.from({ length: slotCount }, (_, i) => {
        const cx = i * slotWidth + slotWidth / 2
        return svg('path', {
            class: 'pc-belt__arrow',
            d: `M ${cx - arrowSize} ${arrowY - arrowSize} `
                + `L ${cx + arrowSize} ${arrowY} `
                + `L ${cx - arrowSize} ${arrowY + arrowSize}`,
        })
    })

    const itemLayer = svg('g', { class: 'pc-belt__items' })

    /*
     * The viewBox starts at negative coordinates rather than the drawing being
     * pushed in by a translate, so everything below can be written in belt-local
     * units — slot 0's left edge is x = 0 — and `slotCenter()` and its callers
     * never learn the overscan exists.
     */
    const originX = overscan + PAD
    const originY = PAD

    const root = svg('svg', {
        class: 'pc-belt',
        viewBox: `${-originX} ${-originY} ${width + originX * 2} ${height + PAD + CAST}`,
        width: width + originX * 2,
        height: height + PAD + CAST,
        // Published so a caller positioning the belt by its *run* can subtract
        // the drawing that sits outside it. The caller passes the run's intended
        // left edge and stays ignorant of the overscan — making it subtract this
        // itself is the version of this that drifts.
        style: {
            '--pc-belt-origin-x': `${originX}px`,
            '--pc-belt-origin-y': `${originY}px`,
        },
        // A group, not an image: the trays on it are the interactive parts and
        // name themselves, so the belt names only itself and its occupancy.
        role: 'group',
        'aria-label': describe(),
    }, [
        // Spans the whole overscan, so the band runs off both ends of the frame
        // and under the ducts. Its rounded, stroked cap is out there where the
        // frame clips it, and a belt whose end is never seen reads as a belt
        // that comes from somewhere.
        svg('rect', {
            class: 'pc-belt__band',
            x: -overscan,
            y: deckY,
            width: width + overscan * 2,
            height: bandHeight,
            rx: BAND_RADIUS * trayWidth,
        }),
        dividers,
        arrows,
        itemLayer,
    ])

    function describe() {
        const held = slots.filter(Boolean).length
        return `Conveyor belt, ${slotCount} slots, ${held} ${held === 1 ? 'tray' : 'trays'}`
    }

    function assertSlot(index) {
        if (!Number.isInteger(index) || index < 0 || index >= slotCount) {
            throw new RangeError(`slot out of bounds: ${index}`)
        }
    }

    /**
     * Where a slot's tray sits: `x` is the slot's centre line, `y` the belt
     * surface a tray rests its base on. Public because the hop animation and
     * the flight to a player's panel both need to talk in belt coordinates.
     *
     * Strict on purpose. `bakery-game.js` positions a flight from this, so a
     * silent off-belt answer here would put a tray somewhere on screen that
     * nothing intended.
     */
    function slotCenter(index) {
        assertSlot(index)
        return { x: index * slotWidth + slotWidth / 2, y: deckY }
    }

    /**
     * Off-stage, beyond the oven end. Where a tray that has just been baked
     * comes from — named rather than reached by index arithmetic, because it is
     * deliberately *not* a slot and `slotCenter()` must keep refusing it.
     */
    function entryCenter() {
        return { x: -overscan / 2, y: deckY }
    }

    /** Off-stage, beyond the waste end. The mirror of `entryCenter()`. */
    function exitCenter() {
        return { x: width + overscan / 2, y: deckY }
    }

    /**
     * Where a tray of any width sits when centred on a point, standing on the
     * band. A string rather than a pair because both the transform and the hop's
     * keyframes want it in exactly this form.
     *
     * Measured by the tray's `rideHeight`, not its height: a tray's price card
     * overhangs the deck, and standing it by its full bounds would sink the card
     * onto the band and float the deck above it.
     */
    function transformAt(item, { x, y }) {
        return `translate(${x - item.width / 2}px, ${y - item.rideHeight}px)`
    }

    /** Where a tray sits when centred over `index`. */
    function transformFor(item, index) {
        return transformAt(item, slotCenter(index))
    }

    /** Centre a tray of any width over its slot, standing on the band. */
    function place(item, index) {
        // Written as a CSS transform rather than the SVG presentation attribute
        // because the hop animates the CSS property, and a presentation
        // attribute would be overridden mid-flight and then snap back when the
        // animation cleared. One representation, no fighting.
        item.el.style.transform = transformFor(item, index)
        if (item.el.parentNode !== itemLayer) itemLayer.appendChild(item.el)
    }

    /**
     * Take a whole new occupancy, the way `belt/advanced` sends one. Full
     * occupancy rather than a diff, so a dropped message self-heals on the next
     * beat instead of leaving the belt quietly wrong.
     *
     * Trays that have left are *detached, not destroyed* — a claimed tray still
     * has an animation to fly through, and the caller owns that. Only
     * `destroy()` disposes of trays.
     */
    function setSlotItems(next = [], { animate = false, duration = HOP_MS } = {}) {
        if (next.length > slotCount) {
            throw new RangeError(`${next.length} items for ${slotCount} slots`)
        }

        // Where everything was, captured before the array is replaced. A tray
        // that was not on the belt is absent, which is how a fresh bake is told
        // apart from a tray that merely moved.
        const before = new Map()
        slots.forEach((item, index) => item && before.set(item, index))

        const incoming = new Set(next.filter(Boolean))
        for (const item of slots) {
            if (item && !incoming.has(item)) item.el.remove()
        }

        slots = Array.from({ length: slotCount }, (_, index) => next[index] ?? null)
        slots.forEach((item, index) => item && place(item, index))

        root.setAttribute('aria-label', describe())

        const hopping = animate && !prefersReducedMotion()
        return hopping ? hop(before, duration) : Promise.resolve()
    }

    /**
     * Play every tray from where it was to where it now is.
     *
     * The final transform is already set by `place()` above, so this only ever
     * animates *back* to a truthful position. If the hop is cancelled, the tab
     * is backgrounded, or the animation never runs at all, the belt is still
     * showing the occupancy the server sent — which is the property that makes
     * this decoration rather than state.
     */
    function hop(before, duration) {
        const flights = []

        for (const [index, item] of slots.entries()) {
            if (!item) continue

            // Not on the belt a moment ago, so it has just come off the oven: it
            // rides in from off-stage rather than appearing in place. The
            // opacity ramp is front-loaded so the tray is fully solid well
            // before it clears the duct — the fade is only there to keep its
            // first frame honest, and it happens where nobody can see it.
            if (!before.has(item)) {
                const entry = transformAt(item, entryCenter())
                flights.push(item.el.animate([
                    { transform: entry, opacity: 0 },
                    { transform: entry, opacity: 1, offset: 0.35 },
                    { transform: transformFor(item, index) },
                ], { duration, easing: 'ease-in-out' }))
                continue
            }

            const from = transformFor(item, before.get(item))
            const to = transformFor(item, index)
            if (from === to) continue

            flights.push(item.el.animate(
                [{ transform: from }, { transform: to }],
                { duration, easing: 'ease-in-out' },
            ))
        }

        // `animationSettled`, never `animation.finished`. An animation only
        // advances while the page is painting, so `finished` simply never
        // settles in a backgrounded tab — and a belt awaiting one raw would
        // deadlock the moment a child switched apps.
        return Promise.all(flights.map(flight => animationSettled(flight, duration + 200)))
    }

    setSlotItems(slotItems)

    return {
        el: root,
        /** The run, not the drawing: the overscan is the belt's own business. */
        width,
        height,
        slotWidth,
        slotCount,
        /** The tray width this belt reserved room for. Trays may differ; they are centred. */
        trayWidth,

        slotCenter,
        entryCenter,
        exitCenter,
        setSlotItems,

        /** The current occupancy, as a copy — the belt's own array stays its own. */
        get slotItems() {
            return [...slots]
        },

        itemAt(index) {
            assertSlot(index)
            return slots[index]
        },

        destroy() {
            for (const item of slots) item?.destroy()
            slots = new Array(slotCount).fill(null)
            root.remove()
        },
    }
}

function assertPositiveInt(value, name) {
    if (!Number.isInteger(value) || value < 1) {
        throw new RangeError(`${name} must be a positive integer, got ${value}`)
    }
}
