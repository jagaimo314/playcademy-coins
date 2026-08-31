import { el } from '../../lib/dom.js'
import { COINS, formatCents } from '../../lib/money.js'
import { createCoin, DISPLAY_TYPES } from '../coin/coin.js'
import '../../styles/base.css'
import './coins.css'

/**
 * Component test page for the coin's three display types. Not part of the app
 * build — open it with `npm run dev` at /src/components/test/coins.html.
 *
 * Every denomination is shown on every face, plus one quarter wired to
 * `flipCoin()` so the flip animation can be eyeballed.
 */

const grid = el('div', { class: 'pc-test-grid' }, [
    el('div', { class: 'pc-test-grid__corner' }),
    ...DISPLAY_TYPES.map(displayType =>
        el('div', { class: 'pc-test-grid__head' }, displayType)),

    ...COINS.flatMap(({ id, plural, value }) => [
        el('div', { class: 'pc-test-grid__label' }, [
            el('strong', {}, plural),
            el('span', { class: 'pc-test-grid__value' }, formatCents(value)),
        ]),
        ...DISPLAY_TYPES.map(displayType =>
            el('div', { class: 'pc-test-grid__cell' },
                createCoin({ denomination: id, displayType }).el)),
    ]),
])

// --- flip tester -----------------------------------------------------------

const tester = createCoin({ denomination: 'quarter', displayType: 'Heads' })
const readout = el('p', { class: 'pc-test-readout' })

function showFace() {
    readout.textContent = `Showing: ${tester.displayType}`
}

const flipTo = changeTo => () => tester.flipCoin(changeTo).then(showFace)

const controls = el('div', { class: 'pc-test-controls' }, [
    el('button', { type: 'button', class: 'pc-test-btn', onClick: flipTo(undefined) }, 'flipCoin()'),
    ...DISPLAY_TYPES.map(displayType =>
        el('button', { type: 'button', class: 'pc-test-btn pc-test-btn--quiet', onClick: flipTo(displayType) },
            `flipCoin('${displayType}')`)),
])

showFace()

document.getElementById('test').append(
    el('header', { class: 'pc-test-header' }, [
        el('h1', {}, 'Coin display types'),
        el('p', {}, 'Every denomination on every face. The quarter below flips on demand.'),
    ]),
    el('section', { class: 'pc-card' }, grid),
    el('section', { class: 'pc-card pc-test-flip' }, [
        el('h2', {}, 'Flip tester'),
        el('div', { class: 'pc-test-flip__stage' }, tester.el),
        readout,
        controls,
    ]),
)
