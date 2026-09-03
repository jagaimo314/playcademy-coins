import { clear, el } from '../../lib/dom.js'
import './meter.css'

/**
 * Above this many cells the track stops being countable and starts being a
 * fringe, so it falls back to a continuous fill. Sixty slivers three pixels
 * apart is not a thing anyone counts; it is a bar with extra steps.
 */
const MAX_CELLS = 20

/**
 * A count, drawn as cells rather than as a fill.
 *
 * This is the difference between a progress bar and a meter, and it is the whole
 * reason this exists next to `progress-bar`: a K–2 kid can *count* cells. Nobody
 * — child or adult — can read a bar that is thirty per cent along, and "how many
 * more do we need" is a question this screen is asked out loud by four children
 * at once.
 *
 * `total` comes off the wire and is not always ten.
 */
export function createMeter({
    /** What is being counted, in words. Shown, and read out. */
    label,
    value = 0,
    total = 10,
    /**
     * `good` counts up towards something wanted, `waste` towards something
     * feared. It sets the colour — and colour is never the only thing carrying
     * it: the two meters differ by label, by position and by direction as well.
     */
    tone = 'good',
}) {
    if (tone !== 'good' && tone !== 'waste') {
        throw new RangeError(`tone must be 'good' or 'waste', got ${tone}`)
    }

    let current = clampValue(value, total)
    let cap = assertTotal(total)

    const count = el('b', { class: 'pc-meter__count' })
    const outOf = el('em', {})

    const track = el('div', {
        class: 'pc-meter__track',
        // One image with one name. A screen reader walking twenty empty cells
        // learns nothing; the count is the whole content.
        role: 'img',
    })

    const root = el('div', { class: ['pc-meter', `pc-meter--${tone}`] }, [
        el('div', { class: 'pc-meter__head' }, [
            el('span', {}, label),
            el('span', { class: 'pc-meter__value' }, [count, outOf]),
        ]),
        track,
    ])

    /**
     * Cells when they can be counted, a fill when they cannot.
     *
     * Rebuilt rather than toggled, because `total` changing is a per-game event
     * and never a per-frame one — the server quotes it once in `room/state` and
     * again only if the game itself changes shape.
     */
    function draw() {
        clear(track)
        const cells = cap <= MAX_CELLS

        track.classList.toggle('is-continuous', !cells)

        if (cells) {
            for (let i = 0; i < cap; i += 1) {
                track.append(el('i', { class: i < current ? 'is-on' : null }))
            }
        } else {
            track.append(el('i', {
                class: 'is-on',
                style: { flex: `0 0 ${(current / cap) * 100}%` },
            }))
        }

        count.textContent = String(current)
        outOf.textContent = `/${cap}`
        track.setAttribute('aria-label', `${label}, ${current} of ${cap}`)
    }

    draw()

    return {
        el: root,

        update(next = {}) {
            if (next.total !== undefined) cap = assertTotal(next.total)
            if (next.value !== undefined) current = next.value

            // Re-clamped whichever of the two moved: a value that outran a
            // shrunken total would draw more cells than the track has.
            current = clampValue(current, cap)
            draw()
        },

        destroy() {
            root.remove()
        },
    }
}

function assertTotal(total) {
    if (!Number.isInteger(total) || total < 1) {
        throw new RangeError(`total must be a positive integer, got ${total}`)
    }
    return total
}

function clampValue(value, total) {
    if (!Number.isInteger(value) || value < 0) {
        throw new RangeError(`value must be a whole count, got ${value}`)
    }
    return Math.min(value, total)
}
