import { svg } from '../../lib/dom.js'
import { TRAY_ASPECT } from '../conveyor-item/conveyor-item.js'
import './conveyor-belt.css'

/** Stroke room, so the band's outline is not clipped by the viewBox edge. */
const PAD = 3

/** Depth of the band, as a fraction of `slotWidth`. */
const BAND = 0.3

/**
 * How much of a slot a tray fills. The remainder is the gap that makes one slot
 * read as separate from the next — without it a full belt is a solid wall of
 * trays and no child can tell which one they are pointing at.
 */
const TRAY_FIT = 0.82

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
    /** Width of one slot, in user units. The belt spans `slotWidth * slotCount`. */
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

    const width = slotWidth * slotCount
    const bandHeight = BAND * slotWidth

    /**
     * Headroom reserved above the band. Fixed at the belt's nominal tray size
     * rather than measured from whatever is currently on it — a belt that
     * changed height as trays came and went would shove the rest of the bakery
     * around on every beat.
     *
     * Rounded to whole units so the translate on every tray reads as a number
     * rather than a float tail — cosmetic, but these end up in the DOM.
     */
    const trayWidth = Math.round(TRAY_FIT * slotWidth)
    const deckY = TRAY_ASPECT * trayWidth
    const height = deckY + bandHeight

    let slots = new Array(slotCount).fill(null)

    const radius = bandHeight / 2
    const pulleys = [radius, width - radius].map(cx => svg('g', {}, [
        svg('circle', { class: 'pc-belt__pulley', cx, cy: deckY + radius, r: radius }),
        svg('circle', { class: 'pc-belt__hub', cx, cy: deckY + radius, r: radius * 0.3 }),
    ]))

    // Boundaries, not centres: the ticks a child counts trays between.
    const dividers = Array.from({ length: slotCount - 1 }, (_, i) => svg('line', {
        class: 'pc-belt__divider',
        x1: (i + 1) * slotWidth,
        y1: deckY + bandHeight * 0.22,
        x2: (i + 1) * slotWidth,
        y2: deckY + bandHeight * 0.78,
    }))

    const itemLayer = svg('g', { class: 'pc-belt__items' })

    const root = svg('svg', {
        class: 'pc-belt',
        viewBox: `0 0 ${width + PAD * 2} ${height + PAD * 2}`,
        width: width + PAD * 2,
        height: height + PAD * 2,
        // A group, not an image: the trays on it are the interactive parts and
        // name themselves, so the belt names only itself and its occupancy.
        role: 'group',
        'aria-label': describe(),
    }, svg('g', { transform: `translate(${PAD} ${PAD})` }, [
        svg('rect', {
            class: 'pc-belt__band',
            x: 0,
            y: deckY,
            width,
            height: bandHeight,
            rx: radius,
        }),
        // Over the band, so the roller faces read as the ends it wraps around.
        pulleys,
        dividers,
        itemLayer,
    ]))

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
     * the incinerator both need to talk in belt coordinates.
     */
    function slotCenter(index) {
        assertSlot(index)
        return { x: index * slotWidth + slotWidth / 2, y: deckY }
    }

    /** Centre a tray of any width over its slot, standing on the band. */
    function place(item, index) {
        const { x, y } = slotCenter(index)
        item.el.setAttribute('transform', `translate(${x - item.width / 2} ${y - item.height})`)
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
    function setSlotItems(next = []) {
        if (next.length > slotCount) {
            throw new RangeError(`${next.length} items for ${slotCount} slots`)
        }

        const incoming = new Set(next.filter(Boolean))
        for (const item of slots) {
            if (item && !incoming.has(item)) item.el.remove()
        }

        slots = Array.from({ length: slotCount }, (_, index) => next[index] ?? null)
        slots.forEach((item, index) => item && place(item, index))

        root.setAttribute('aria-label', describe())
    }

    setSlotItems(slotItems)

    return {
        el: root,
        width,
        height,
        slotWidth,
        slotCount,
        /** The tray width this belt reserved room for. Trays may differ; they are centred. */
        trayWidth,

        slotCenter,
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
