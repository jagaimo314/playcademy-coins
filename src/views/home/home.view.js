import { el } from '../../lib/dom.js'
import { isValidCode, normalizeCode, CODE_LENGTH } from '../../lib/room-code.js'
import { createPrimaryButton } from '../../components/primary-button/primary-button.js'
import './home.css'

/**
 * The menu. Three options: start the lesson, start a bakery, join a bakery.
 */
export function createHomeView({ store, navigate }) {
    const lessonDone = () => Boolean(store.get('lesson.completed'))

    const startLesson = createPrimaryButton({
        label: lessonDone() ? 'Practice the Lesson again' : 'Start Lesson',
        variant: 'blue',
        onClick: () => navigate('/lesson'),
    })

    const startBakery = createPrimaryButton({
        label: 'Start Bakery',
        variant: 'green',
        onClick: () => navigate('/bakery'),
    })

    /** Reflect the unlock gate. Also called when the store changes underneath us. */
    function syncBakeryGate(completed) {
        startBakery.update({
            disabled: !completed,
            disabledReason: completed ? null : 'Finish the Lesson first to open your own bakery.',
        })
    }

    syncBakeryGate(lessonDone())
    const unsubscribe = store.subscribe('lesson.completed', syncBakeryGate)

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
                setJoinError(`A bakery code is ${CODE_LENGTH} letters, like ABCD.`)
                codeInput.focus()
                return
            }

            navigate(`/bakery?code=${code}`)
        },
    }, [
        el('label', { class: 'pc-home__label', for: 'join-code' }, "Got a friend's code?"),
        el('div', { class: 'pc-home__join-row' }, [
            codeInput,
            el('button', { type: 'submit', class: 'pc-button pc-button--gold' }, 'Join Bakery'),
        ]),
        joinError,
    ])

    // --- Layout -------------------------------------------------------------

    const root = el('div', { class: 'pc-home' }, [
        el('header', { class: 'pc-home__header' }, [
            el('p', { class: 'pc-home__eyebrow' }, 'Playcademy'),
            el('h1', {}, 'Coin Sums'),
            el('p', { class: 'pc-home__subtitle' },
                'Learn to count coins, then run a bakery with your friends.'),
        ]),

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
