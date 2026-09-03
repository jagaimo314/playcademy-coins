import { el } from '../../lib/dom.js'
import { isValidCode, normalizeCode, CODE_LENGTH } from '../../lib/room-code.js'
import { createPrimaryButton } from '../../components/primary-button/primary-button.js'
import './home.css'

/**
 * The menu. Three options: start the lesson, go to the bake sale, join a bake sale.
 */
export function createHomeView({ store, navigate }) {
    const lessonDone = () => Boolean(store.get('lesson.completed'))

    const startLesson = createPrimaryButton({
        label: lessonDone() ? 'Practice the Lesson again' : 'Start Lesson',
        variant: 'blue',
        onClick: () => navigate('/lesson'),
    })

    const startBakery = createPrimaryButton({
        label: 'Go to the Bake Sale',
        variant: 'green',
        onClick: () => navigate('/bakery'),
    })

    /** Reflect the unlock gate. Also called when the store changes underneath us. */
    function syncBakeryGate(completed) {
        startBakery.update({
            disabled: !completed,
            disabledReason: completed ? null : 'Finish the Lesson first to open your own bake sale.',
        })
    }

    syncBakeryGate(lessonDone())
    const unsubscribe = store.subscribe('lesson.completed', syncBakeryGate)

    // --- The knowledge graph ------------------------------------------------

    /*
     * A plain anchor, not a `createPrimaryButton`: this leaves the app instead
     * of routing inside it, and a link is what the browser — and a screen
     * reader — should be told it is. It opens in a new tab so a kid who taps it
     * never loses the menu behind a doc they cannot navigate back out of.
     *
     * It sits outside the menu card on purpose. The card is the kid's: lesson,
     * bakery, a friend's code. This is a doc for the grown-up in the room and
     * belongs to neither of those, so it is kept off that surface rather than
     * stacked in among things a kid is meant to press.
     */
    const knowledgeGraph = el('div', { class: 'pc-home__doc' }, el('a', {
        class: 'pc-button pc-button--quiet pc-home__doc-link',
        href: '/docs/coin-sums-knowledge-graph.html',
        target: '_blank',
        rel: 'noopener',
    }, [
        'Knowledge Graph',
        el('span', { class: 'pc-visually-hidden' }, ' (opens in a new tab)'),
    ]))

    // --- Join by code -------------------------------------------------------

    const codeInput = el('input', {
        id: 'join-code',
        type: 'text',
        class: 'pc-home__code',
        autocomplete: 'off',
        autocapitalize: 'characters',
        spellcheck: 'false',
        maxlength: String(CODE_LENGTH),
        placeholder: 'ABCD',
        'aria-describedby': 'join-error',
        onInput: () => {
            // Normalize as they type so a lowercase or stray keystroke never
            // becomes an error message.
            codeInput.value = normalizeCode(codeInput.value)
            setJoinError('')
        },
    })

    const joinError = el('p', { id: 'join-error', class: 'pc-home__error', role: 'alert' })

    function setJoinError(message) {
        joinError.textContent = message
        joinError.hidden = !message
        codeInput.setAttribute('aria-invalid', String(Boolean(message)))
    }

    setJoinError('')

    const joinForm = el('form', {
        class: 'pc-home__join',
        novalidate: true,
        onSubmit: event => {
            event.preventDefault()

            const code = normalizeCode(codeInput.value)

            if (!isValidCode(code)) {
                setJoinError(`A bake sale code is ${CODE_LENGTH} letters, like ABCD.`)
                codeInput.focus()
                return
            }

            navigate(`/bakery?code=${code}`)
        },
    }, [
        el('label', { class: 'pc-home__label', for: 'join-code' }, "Got a friend's code?"),
        el('div', { class: 'pc-home__join-row' }, [
            codeInput,
            el('button', { type: 'submit', class: 'pc-button pc-button--gold' }, 'Join the Bake Sale'),
        ]),
        joinError,
    ])

    // --- Layout -------------------------------------------------------------

    const root = el('div', { class: 'pc-home' }, [
        el('header', { class: 'pc-home__header' }, [
            el('p', { class: 'pc-home__eyebrow' }, 'Playcademy'),
            el('h1', {}, 'Coin Sums'),
            el('p', { class: 'pc-home__subtitle' },
                'Learn to count coins, then run a bake sale with your friends.'),
        ]),

        knowledgeGraph,

        el('div', { class: 'pc-home__menu pc-card pc-stack' }, [
            startLesson.el,
            startBakery.el,
            el('hr', { class: 'pc-home__divider' }),
            joinForm,
        ]),
    ])

    return {
        el: root,
        destroy() {
            unsubscribe()
            startLesson.destroy()
            startBakery.destroy()
            root.remove()
        },
    }
}
