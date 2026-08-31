import { el } from '../../lib/dom.js'
import { createNarrator } from '../../components/narrator/narrator.js'
import { createProgressBar } from '../../components/progress-bar/progress-bar.js'
import { createAnswerInput } from '../../components/answer-input/answer-input.js'
import { createCoin } from '../../components/coin/coin.js'
import { PROBLEM_COUNT, SCRIPT } from './lesson.content.js'
import './lesson.css'

/**
 * SCAFFOLD. The structure and component wiring are real; the teaching flow is not.
 *
 * Intended phases:
 *   intro    -> narrated direct instruction, walking SCRIPT
 *   practice -> the 10 typed-answer problems, each classified on submit
 *   summary  -> the diagnostic report, then mark the lesson complete
 */
export function createLessonView({ store, navigate }) {
    const narrator = createNarrator()
    const progress = createProgressBar({ value: 0, max: PROBLEM_COUNT, label: 'Lesson progress' })

    const coins = ['nickel', 'nickel', 'nickel'].map(denomination => createCoin({ denomination }))
    const coinRow = el('div', { class: 'pc-coin-row' }, coins.map(c => c.el))

    const answer = createAnswerInput({
        label: 'How much is this worth?',
        onSubmit: ({ cents }) => {
            // TODO: classify(...) against the current problem, advance, record.
            answer.setStatus('hint', `You typed ${cents}. Scoring is not wired up yet.`)
        },
    })

    // Speech is blocked until the first gesture, so the lesson opens on a tap
    // rather than auto-playing. This is the real start button, not a placeholder.
    const startButton = el('button', {
        type: 'button',
        class: 'pc-button pc-button--blue',
        onClick: () => {
            startButton.disabled = true
            narrator.say(SCRIPT[0].say)
        },
    }, 'Start')

    // TEMPORARY: lets us exercise the Bakery unlock gate before the lesson
    // flow exists. Delete once `summary` sets this for real.
    const devComplete = el('button', {
        type: 'button',
        class: 'pc-button pc-button--quiet pc-lesson__dev',
        onClick: () => {
            store.set('lesson.completed', true)
            navigate('/')
        },
    }, 'Dev: mark lesson complete')

    const root = el('section', { class: 'pc-lesson pc-stack' }, [
        el('header', {}, [
            el('h1', {}, 'Counting coins that match'),
            el('p', { class: 'pc-lesson__note' },
                'Scaffold: components are wired, the lesson flow is not built yet.'),
        ]),

        narrator.el,
        el('div', { class: 'pc-card pc-stack' }, [coinRow, answer.el]),
        progress.el,

        el('div', { class: 'pc-lesson__actions' }, [
            startButton,
            el('button', {
                type: 'button',
                class: 'pc-button pc-button--quiet',
                onClick: () => navigate('/'),
            }, 'Back to menu'),
            devComplete,
        ]),
    ])

    return {
        el: root,
        destroy() {
            // The narrator holds page-global speech state — it must be torn
            // down explicitly or it keeps talking over the next view.
            narrator.destroy()
            progress.destroy()
            answer.destroy()
            for (const coin of coins) coin.destroy()
            root.remove()
        },
    }
}
