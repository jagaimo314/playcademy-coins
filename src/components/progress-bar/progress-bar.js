import { el } from '../../lib/dom.js'
import './progress-bar.css'

/**
 * Progress through a set of steps. Used for the lesson's 10 problems and,
 * later, for the bakery's order queue.
 *
 * Deliberately shows position, not score — a kid seeing "3 wrong" halfway
 * through a lesson stops trying.
 */
export function createProgressBar({ value = 0, max = 10, label = 'Progress' }) {
    const fill = el('div', { class: 'pc-progress__fill' })

    const text = el('p', { class: 'pc-progress__text' })

    const track = el('div', {
        class: 'pc-progress__track',
        role: 'progressbar',
        'aria-label': label,
        'aria-valuemin': '0',
        'aria-valuemax': String(max),
    }, fill)

    const root = el('div', { class: 'pc-progress' }, [track, text])

    function update(next = {}) {
        const nextValue = next.value ?? value
        const nextMax = next.max ?? max

        value = Math.max(0, Math.min(nextValue, nextMax))
        max = nextMax

        const pct = max === 0 ? 0 : (value / max) * 100

        fill.style.width = `${pct}%`
        track.setAttribute('aria-valuenow', String(value))
        track.setAttribute('aria-valuemax', String(max))
        text.textContent = `${value} of ${max}`
    }

    update({ value, max })

    return {
        el: root,
        update,
        destroy() {
            root.remove()
        },
    }
}
