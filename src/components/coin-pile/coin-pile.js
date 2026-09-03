import { animationSettled, el, prefersReducedMotion } from '../../lib/dom.js'
import { describeCount } from '../../lib/money.js'
import { createCoin } from '../coin/coin.js'
import './coin-pile.css'

/** Appear, hold, fade — the whole life of the boundary drawn round the pile. */
const BOX_MS = 1700

/** How long a coin stays turned to its value side during a peek. */
const PEEK_MS = 900

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * A pile of coins, all one denomination, laid out in rows — the set a student
 * is asked to count.
 *
 * It exists because the lesson has to *gesture* at the pile, not just show it.
 * A row of coins can be drawn with a flex container; drawing a boundary round
 * the whole pile ("these are nickels"), round one coin at a time (counting
 * them), or turning every coin over to its value side and back ("remember, five
 * cents") is the pile's own job, and all three are things the Bakery will want
 * too.
 *
 * Presentational: it reports taps upward and holds no state but the marks it
 * has been told to draw.
 */
export function createCoinPile({
    denomination,
    count,
    /** Coins per row. The last row is short when the count does not divide. */
    columns = 5,
    /** Gap between coins, in pixels. */
    gap = 5,
    /** The face the pile rests on. `'Generic'` is the value side. */
    displayType = 'Heads',
    /**
     * A face per coin, overriding `displayType` where it has one — this is how
     * a mixed pile is asked for, with `randomFaces(count)` from `coin-faces.js`.
     * The caller rolls them rather than the pile, because the chart the pile is
     * counted onto has to be given the same array.
     */
    displayTypes = null,
    /** Called with a coin's index when it is tapped. Omit for a pile to look at. */
    onCoinTap = null,
}) {
    const interactive = typeof onCoinTap === 'function'

    const coins = Array.from({ length: count }, (_, index) => createCoin({
        denomination,
        displayType: displayTypes?.[index] ?? displayType,
        onClick: interactive ? () => onCoinTap(index) : null,
    }))

    /**
     * One slot per coin, and the reason the pile has them at all: the mark drawn
     * round a counted coin is a rounded rect, and neither shape nor placement
     * can come from the coin itself. A coin's own outline takes the coin's pill
     * radius — a circle round a circle — and anything drawn inside a coin is
     * clipped to the disc. The slot is the box the mark can live in.
     */
    const slots = coins.map(instance => el('div', { class: 'pc-pile__slot' }, instance.el))

    const box = el('div', { class: 'pc-pile__box', hidden: true })

    const root = el('div', {
        class: 'pc-pile',
        style: {
            '--pc-pile-columns': String(columns),
            '--pc-pile-gap': `${gap}px`,
        },
        // Coins that can be tapped are buttons and name themselves; coins that
        // cannot are one picture, and the picture needs the name.
        role: interactive ? 'group' : 'img',
        'aria-label': `${describeCount(count, denomination)} to count`,
    }, [
        el('div', { class: 'pc-pile__coins' }, slots),
        box,
    ])

    /**
     * Draw a boundary round the whole pile, hold it, and let it fade. Resolves
     * once the box is gone.
     */
    async function revealBox() {
        box.hidden = false

        // Reduced motion keeps the box — it is information, not decoration —
        // and drops only the movement.
        const frames = prefersReducedMotion()
            ? [{ opacity: 1 }, { opacity: 1 }]
            : [
                { opacity: 0, transform: 'scale(0.94)' },
                { opacity: 1, transform: 'scale(1)', offset: 0.18 },
                { opacity: 1, transform: 'scale(1)', offset: 0.72 },
                { opacity: 0, transform: 'scale(1)' },
            ]

        await animationSettled(box.animate(frames, { duration: BOX_MS, easing: 'ease-out' }))

        box.hidden = true
    }

    /**
     * Turn `instances` over to `face`, hold, and turn each back to the face it
     * was resting on — read per coin, not once for the pile, because a mixed
     * pile has no single face to come home to.
     */
    async function peek(instances, face) {
        const resting = instances.map(instance => instance.displayType)

        // Nothing to reveal by turning a coin that already shows that face; an
        // empty selection lands here too.
        if (resting.every(from => from === face)) return

        await Promise.all(instances.map(instance => instance.flipCoin(face)))
        await delay(PEEK_MS)
        await Promise.all(instances.map((instance, index) => instance.flipCoin(resting[index])))
    }

    return {
        el: root,
        coins,
        denomination,
        count,

        revealBox,

        /** Turn the whole pile over to its value side and back. */
        peekAll(face = 'Generic') {
            return peek(coins, face)
        },

        /** Turn one coin over to its value side and back. */
        peekCoin(index, face = 'Generic') {
            const instance = coins[index]
            return instance ? peek([instance], face) : Promise.resolve()
        },

        /**
         * Mark one coin: `{ selected }` draws a boundary round it, `caption`
         * writes underneath it. Used by both counting passes — the ordinals as
         * the pile is counted one by one, then the boundary alone as it is
         * skip-counted, because that running total belongs on the chart.
         *
         * The boundary is drawn on the slot, but `selected` still goes to the
         * coin: that is what puts the state on an interactive coin's
         * `aria-pressed`, and the mark must never be visual only.
         */
        markCoin(index, next) {
            coins[index]?.update(next)

            if (next?.selected !== undefined) {
                slots[index]?.classList.toggle('is-marked', next.selected)
            }
        },

        /** Clear every boundary and caption, ready for the next pass. */
        reset() {
            for (const instance of coins) instance.update({ selected: false, caption: null })
            for (const slot of slots) slot.classList.remove('is-marked')
        },

        destroy() {
            for (const instance of coins) instance.destroy()
            root.remove()
        },
    }
}
