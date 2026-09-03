/**
 * Manual test page for Grid, SkipCountGrid and SkipCountCurrencyGrid.
 *
 * Served by Vite at /src/components/test/skipCountGrid.html. Not part of the
 * app: nothing imports this, and no route points at it.
 */
import '../../styles/base.css'

import { append, el } from '../../lib/dom.js'
import { describeCount, formatCents } from '../../lib/money.js'
import { randomFaces } from '../coin/coin-faces.js'
import { createPrimaryButton } from '../primary-button/primary-button.js'
import { Grid } from '../Grid.js'
import { SkipCountGrid } from '../SkipCountGrid.js'
import { SkipCountCurrencyGrid } from '../SkipCountCurrencyGrid.js'

const mount = document.getElementById('app')

append(mount, [
    el('h1', {}, 'Grid components'),
    el('p', {}, 'Manual test page. Each section exercises one component.'),
    currencySection(),
    skipCountSection(),
    directionSection(),
    checksSection(),
])

/* ---------------------------------------------------------------------------
 * SkipCountCurrencyGrid — the headline case: 5 nickels on a 10x10 grid.
 * ------------------------------------------------------------------------- */
function currencySection() {
    const readout = el('p', { class: 'demo__readout' })

    // Mixed faces, as the Lesson passes them, so a reload is a fresh set: this
    // is where a face that does not survive the reveal shows up.
    const grid = new SkipCountCurrencyGrid({
        numRows: 10,
        numCols: 10,
        denomination: 'nickel',
        numCoins: 5,
        displayTypes: randomFaces(5),
        onReveal: ({ count }) => showTotal(count),
    })

    function showTotal(count) {
        readout.textContent = `${describeCount(count, grid.denomination)} — ${formatCents(grid.totalAfter(count))}`
    }

    showTotal(0)

    const animate = createPrimaryButton({
        label: 'Count the nickels',
        onClick: () => grid.animateSkipCount(),
    })

    const instant = createPrimaryButton({
        label: 'Show all at once',
        variant: 'green',
        onClick: () => grid.animateSkipCount(0),
    })

    const reset = createPrimaryButton({
        label: 'Reset',
        variant: 'red',
        onClick: () => {
            grid.resetSkipCount()
            showTotal(0)
        },
    })

    return el('section', { class: 'demo pc-card pc-stack' }, [
        el('h2', {}, 'SkipCountCurrencyGrid'),
        el('p', {}, 'A ghosted nickel lands on every 5¢, heads or tails as it fell — reload for a new set. animateSkipCount() walks them 500ms apart; passing 0 reveals them all at once.'),
        readout,
        el('div', { class: 'demo__row' }, [animate.el, instant.el, reset.el]),
        grid.el,
    ])
}

/* ---------------------------------------------------------------------------
 * SkipCountGrid — the same counting behaviour with its plain circle marks.
 * ------------------------------------------------------------------------- */
function skipCountSection() {
    const grid = new SkipCountGrid({ skipInterval: 5 })

    const animate = createPrimaryButton({
        label: 'Count by 5s',
        onClick: () => grid.animateSkipCount(200),
    })

    const reset = createPrimaryButton({
        label: 'Reset',
        variant: 'red',
        onClick: () => grid.resetSkipCount(),
    })

    // Highlighting is independent of the count, so show it alongside.
    grid.highlightCell(1)
    grid.highlightCell(100)

    return el('section', { class: 'demo pc-card pc-stack' }, [
        el('h2', {}, 'SkipCountGrid'),
        el('p', {}, 'Defaults, counting by 5 to the end of the grid, at 200ms. Cells 1 and 100 are highlighted to show highlightCell().'),
        el('div', { class: 'demo__row' }, [animate.el, reset.el]),
        grid.el,
    ])
}

/* ---------------------------------------------------------------------------
 * Grid — the direction and isBounded options, seen through cell numbering.
 * ------------------------------------------------------------------------- */
function directionSection() {
    const variants = [
        { direction: 'right down', note: 'default — a hundred-chart' },
        { direction: 'left down', note: 'rows read right to left' },
        { direction: 'down right', note: 'columns first, top to bottom' },
        { direction: 'up right', note: 'columns first, bottom to top' },
    ]

    const figures = variants.map(({ direction, note }) => {
        // maxMarks: 0 keeps the indicators out of the way; this is about order.
        const grid = new SkipCountGrid({
            numRows: 4,
            numCols: 4,
            cellSize: 34,
            direction,
            maxMarks: 0,
        })

        return el('figure', { class: 'demo__figure' }, [
            grid.el,
            el('figcaption', { class: 'demo__caption' }, [
                el('code', {}, direction),
                ` — ${note}`,
            ]),
        ])
    })

    const unbounded = new Grid({ numRows: 4, numCols: 4, cellSize: 34, isBounded: false })

    figures.push(el('figure', { class: 'demo__figure' }, [
        unbounded.el,
        el('figcaption', { class: 'demo__caption' }, [
            el('code', {}, 'isBounded: false'),
            ' — bare Grid, no outer border',
        ]),
    ]))

    return el('section', { class: 'demo pc-card pc-stack' }, [
        el('h2', {}, 'Grid'),
        el('p', {}, 'direction sets the counting order, which every cell/row/col conversion follows.'),
        el('div', { class: 'demo__grids' }, figures),
    ])
}

/* ---------------------------------------------------------------------------
 * Geometry and counting self-checks.
 * ------------------------------------------------------------------------- */
function checksSection() {
    const list = el('ul', { class: 'checks' })
    const summary = el('p', { class: 'demo__readout' }, 'Running checks…')

    const section = el('section', { class: 'demo pc-card pc-stack' }, [
        el('h2', {}, 'Self-checks'),
        summary,
        list,
    ])

    runChecks().then(results => {
        const passed = results.filter(r => r.ok).length

        summary.textContent = `${passed} of ${results.length} checks passed`
        summary.style.color = passed === results.length ? 'var(--pc-green-ink)' : 'var(--pc-red-deep)'

        append(list, results.map(({ ok, name, detail }) => el('li', {}, [
            el('span', { class: ok ? 'is-pass' : 'is-fail' }, ok ? '✓' : '✗'),
            el('span', {}, name),
            detail ? el('span', { class: 'checks__detail' }, `— ${detail}`) : null,
        ])))
    })

    return section
}

async function runChecks() {
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

    const first = (...messages) => messages.find(Boolean)

    check('right down: (0,0)=1, (0,9)=10, (1,0)=11, (9,9)=100', () => {
        const grid = new Grid({ direction: 'right down' })
        return first(
            expect(grid.calcCellByRowCol(0, 0), 1, '(0,0)'),
            expect(grid.calcCellByRowCol(0, 9), 10, '(0,9)'),
            expect(grid.calcCellByRowCol(1, 0), 11, '(1,0)'),
            expect(grid.calcCellByRowCol(9, 9), 100, '(9,9)'),
        )
    })

    check('left down: (0,9)=1, (0,0)=10, (1,9)=11', () => {
        const grid = new Grid({ direction: 'left down' })
        return first(
            expect(grid.calcCellByRowCol(0, 9), 1, '(0,9)'),
            expect(grid.calcCellByRowCol(0, 0), 10, '(0,0)'),
            expect(grid.calcCellByRowCol(1, 9), 11, '(1,9)'),
        )
    })

    check('down right: (0,0)=1, (9,0)=10, (0,1)=11', () => {
        const grid = new Grid({ direction: 'down right' })
        return first(
            expect(grid.calcCellByRowCol(0, 0), 1, '(0,0)'),
            expect(grid.calcCellByRowCol(9, 0), 10, '(9,0)'),
            expect(grid.calcCellByRowCol(0, 1), 11, '(0,1)'),
        )
    })

    check('up right: (9,0)=1, (0,0)=10, (9,1)=11', () => {
        const grid = new Grid({ direction: 'up right' })
        return first(
            expect(grid.calcCellByRowCol(9, 0), 1, '(9,0)'),
            expect(grid.calcCellByRowCol(0, 0), 10, '(0,0)'),
            expect(grid.calcCellByRowCol(9, 1), 11, '(9,1)'),
        )
    })

    check('calcRowColByCell round-trips every cell, every direction', () => {
        for (const direction of ['right down', 'left down', 'right up', 'down right', 'up right', 'down left']) {
            // Non-square on purpose: catches numRows/numCols mix-ups.
            const grid = new Grid({ numRows: 4, numCols: 7, direction })

            for (let cell = 1; cell <= grid.cellCount; cell += 1) {
                const back = grid.calcCellByRowCol(grid.calcRowColByCell(cell))
                if (back !== cell) return `${direction}: cell ${cell} came back as ${back}`
            }
        }
        return undefined
    })

    check('calcCellCenter is the middle of the cell', () => {
        const grid = new Grid({ cellSize: 40 })
        return first(
            expect(grid.calcCellCenter(1), { x: 20, y: 20 }, 'cell 1'),
            expect(grid.calcCellCenter(10), { x: 380, y: 20 }, 'cell 10'),
            expect(grid.calcCellCenter(100), { x: 380, y: 380 }, 'cell 100'),
        )
    })

    check('isBounded draws (and omits) the border', () => first(
        expect(!!new Grid({}).el.querySelector('.pc-grid__border'), true, 'bounded'),
        expect(!!new Grid({ isBounded: false }).el.querySelector('.pc-grid__border'), false, 'unbounded'),
    ))

    check('interior lines only: 9 + 9 for a 10x10', () => {
        const grid = new Grid({})
        return expect(grid.el.querySelectorAll('.pc-grid__line').length, 18, 'line count')
    })

    check('a same-axis direction is rejected', () => {
        try {
            new Grid({ direction: 'right left' })
        } catch {
            return undefined
        }
        return 'no error thrown'
    })

    check('an out-of-range cell is rejected', () => {
        const grid = new Grid({})
        try {
            grid.calcCellCenter(101)
        } catch {
            return undefined
        }
        return 'no error thrown'
    })

    check('marks land on every skipInterval, to the end of the grid', () => {
        const grid = new SkipCountGrid({ skipInterval: 25 })
        return first(
            expect(grid.skipCells, [25, 50, 75, 100], 'skipCells'),
            expect(grid.el.querySelectorAll('.pc-skipgrid__mark').length, 4, 'marks drawn'),
        )
    })

    check('maxMarks caps the count', () => (
        expect(new SkipCountGrid({ skipInterval: 5, maxMarks: 3 }).skipCells, [5, 10, 15], 'skipCells')
    ))

    check('every cell is labelled', () => {
        const grid = new SkipCountGrid({})
        const labels = [...grid.el.querySelectorAll('.pc-skipgrid__label')]
        return first(
            expect(labels.length, 100, 'label count'),
            expect(labels[0].textContent, '1', 'first label'),
            expect(labels.at(-1).textContent, '100', 'last label'),
        )
    })

    check('5 nickels: interval 5, marks at 5..25, total 25¢', () => {
        const grid = new SkipCountCurrencyGrid({ denomination: 'nickel', numCoins: 5 })
        return first(
            expect(grid.skipInterval, 5, 'skipInterval'),
            expect(grid.skipCells, [5, 10, 15, 20, 25], 'skipCells'),
            expect(grid.total, 25, 'total'),
            expect(grid.totalAfter(3), 15, 'totalAfter(3)'),
        )
    })

    check('currency labels carry the cent symbol', () => {
        const grid = new SkipCountCurrencyGrid({})
        return first(
            expect(grid.formatCellLabel(7), '7¢', 'formatCellLabel'),
            expect(grid.el.querySelector('.pc-skipgrid__label').textContent, '1¢', 'first label'),
        )
    })

    check('the indicator is a real coin component, ghosted', () => {
        const grid = new SkipCountCurrencyGrid({ denomination: 'dime', numCoins: 4 })
        return first(
            expect(grid.skipCells, [10, 20, 30, 40], 'skipCells'),
            expect(grid.el.querySelectorAll('.pc-currencygrid__ghost .pc-coin--dime').length, 4, 'ghost coins'),
        )
    })

    /** The faces on the chart, in counting order. */
    const ghostFaces = grid => [...grid.el.querySelectorAll('.pc-currencygrid__ghost .pc-coin')]
        .map(node => node.dataset.displayType)

    check('displayTypes land on the indicators in counting order', () => {
        const faces = ['Tails', 'Heads', 'Tails', 'Tails']
        const grid = new SkipCountCurrencyGrid({ denomination: 'dime', numCoins: 4, displayTypes: faces })
        return expect(ghostFaces(grid), faces, 'faces')
    })

    check('a coin with no face given rests on Heads', () => {
        const grid = new SkipCountCurrencyGrid({ denomination: 'penny', numCoins: 3, displayTypes: ['Tails'] })
        return expect(ghostFaces(grid), ['Tails', 'Heads', 'Heads'], 'faces')
    })

    check('an unknown denomination is rejected', () => {
        try {
            new SkipCountCurrencyGrid({ denomination: 'doubloon' })
        } catch {
            return undefined
        }
        return 'no error thrown'
    })

    check('marks start hidden', () => (
        expect(new SkipCountCurrencyGrid({}).revealedCount, 0, 'revealedCount')
    ))

    check('animateSkipCount(0) reveals everything synchronously', () => {
        const grid = new SkipCountCurrencyGrid({ denomination: 'quarter', numCoins: 4 })
        grid.animateSkipCount(0)
        return expect(grid.revealedCount, 4, 'revealedCount')
    })

    // The remaining checks are about timing, so they await the animation.
    const timed = new SkipCountCurrencyGrid({ denomination: 'nickel', numCoins: 5 })

    const reveals = []
    timed.onReveal = ({ cell, count }) => reveals.push([cell, count])

    const completed = await timed.animateSkipCount(5)

    check('animateSkipCount resolves true and reveals each mark in order', () => first(
        expect(completed, true, 'resolved'),
        expect(timed.revealedCount, 5, 'revealedCount'),
        expect(reveals, [[5, 1], [10, 2], [15, 3], [20, 4], [25, 5]], 'onReveal calls'),
    ))

    check('resetSkipCount hides them again', () => {
        timed.resetSkipCount()
        return first(
            expect(timed.revealedCount, 0, 'revealedCount'),
            expect(timed.isAnimating, false, 'isAnimating'),
        )
    })

    const interrupted = new SkipCountCurrencyGrid({ denomination: 'nickel', numCoins: 5 })
    const pending = interrupted.animateSkipCount(50)
    interrupted.resetSkipCount()
    const cancelled = await pending

    check('resetSkipCount mid-count resolves the animation false', () => first(
        expect(cancelled, false, 'resolved'),
        expect(interrupted.revealedCount, 0, 'revealedCount'),
    ))

    return results
}
