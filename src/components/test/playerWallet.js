import { el } from '../../lib/dom.js'
import { createPlayerWallet } from '../player-wallet/player-wallet.js'
import '../../styles/base.css'
import './playerWallet.css'

/**
 * Component test page for the player wallet. Not part of the app build — open
 * it with `npm run dev` at /src/components/test/playerWallet.html.
 *
 * Four wallets sit along the bottom of a 1200x800 frame, which is the Bakery's
 * real base band (y 640-800, four equal slices) rather than an arbitrary row.
 * The four hands below are deliberately lopsided — ten of one coin, fifteen
 * mixed, four mixed — because the thing worth looking at is that a quarter is
 * still visibly bigger than a dime in *every* panel, at four different scales.
 */

const FRAME = { width: 1200, height: 800 }

/** The base band, split four ways with an even gutter. */
const BAND = { top: 640, gutter: 16 }
const WALLET = {
    width: Math.floor((FRAME.width - BAND.gutter * 5) / 4),
    height: 150,
}

/** `times(3, 'dime')` -> three dimes. Hands read as they are spoken. */
const times = (count, id) => Array.from({ length: count }, () => id)

const PLAYERS = [
    { color: 'red', name: 'Hank', coins: times(10, 'nickel') },
    {
        color: 'green',
        name: 'Scott',
        coins: [...times(3, 'dime'), 'quarter', ...times(4, 'penny')],
    },
    {
        color: 'blue',
        name: 'Bobby',
        coins: [...times(5, 'dime'), ...times(5, 'nickel'), ...times(5, 'penny')],
    },
    { color: 'yellow', name: 'Jean', coins: ['quarter', 'nickel', 'dime', 'penny'] },
]

const wallets = PLAYERS.map(player => createPlayerWallet({
    ...player,
    width: WALLET.width,
    height: WALLET.height,
}))

const band = el('div', {
    class: 'pc-test-band',
    style: {
        top: `${BAND.top}px`,
        gap: `${BAND.gutter}px`,
        padding: `0 ${BAND.gutter}px`,
    },
}, wallets.map(wallet => wallet.el))

const frame = el('div', {
    class: 'pc-test-frame',
    style: { width: `${FRAME.width}px`, height: `${FRAME.height}px` },
}, [
    el('p', { class: 'pc-test-frame__note' },
        `${FRAME.width}x${FRAME.height} frame. The base band starts at y ${BAND.top}.`),
    band,
])

// --- size controls ---------------------------------------------------------
//
// Width and height are configurable, so the page has to let you push on them.
// Drag either one and watch the coins re-fit: they scale together, never
// independently, so the ratios between denominations hold at any box size.

const readout = el('p', { class: 'pc-test-readout' })

function showSizes() {
    readout.textContent = wallets
        .map(wallet => `${wallet.name} ${wallet.coins.length} coins @ ${wallet.coinSize.toFixed(1)}px`)
        .join('   ·   ')
}

function slider({ label, min, max, value, onInput }) {
    const output = el('span', { class: 'pc-test-slider__value' }, `${value}px`)

    const input = el('input', {
        type: 'range',
        class: 'pc-test-slider__input',
        min: String(min),
        max: String(max),
        value: String(value),
        'aria-label': label,
        onInput: event => {
            const next = Number(event.target.value)
            output.textContent = `${next}px`
            onInput(next)
            showSizes()
        },
    })

    return el('label', { class: 'pc-test-slider' }, [
        el('span', { class: 'pc-test-slider__label' }, label),
        input,
        output,
    ])
}

const controls = el('div', { class: 'pc-test-controls' }, [
    slider({
        label: 'Wallet width',
        min: 140,
        max: WALLET.width,
        value: WALLET.width,
        onInput: width => {
            for (const wallet of wallets) wallet.update({ width })
        },
    }),
    slider({
        label: 'Wallet height',
        min: 80,
        max: 240,
        value: WALLET.height,
        onInput: height => {
            band.style.top = `${FRAME.height - 10 - height}px`
            for (const wallet of wallets) wallet.update({ height })
        },
    }),
])

showSizes()

document.getElementById('test').append(
    el('header', { class: 'pc-test-header' }, [
        el('h1', {}, 'Player wallets'),
        el('p', {}, 'Four colour-coded hands along the base of the Bakery frame. Resize the boxes and the coins re-fit; the ratios between denominations do not move.'),
    ]),
    el('section', { class: 'pc-card' }, [controls, readout]),
    frame,
)
