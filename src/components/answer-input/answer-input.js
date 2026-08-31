import { el } from '../../lib/dom.js'
import { parseAnswer } from '../../lib/money.js'
import './answer-input.css'

/**
 * Typed-answer field. The brief forbids multiple choice, so this is the only
 * way a student answers anything.
 *
 * Submits on Enter or on the button. Raw text is handed up alongside the parsed
 * cents value — the diagnostics need the original keystrokes to tell a
 * transposition apart from a miscount.
 */
export function createAnswerInput({
    label = 'How much is it worth?',
    placeholder = 'Type a number',
    onSubmit,
}) {
    const id = `answer-${Math.random().toString(36).slice(2, 9)}`

    const input = el('input', {
        id,
        type: 'text',
        // `inputmode` gives a numeric keypad on tablets without blocking the
        // stray "c" of "35c", which `type="number"` would swallow.
        inputmode: 'numeric',
        autocomplete: 'off',
        class: 'pc-answer__input',
        placeholder,
    })

    const hint = el('p', { class: 'pc-answer__hint', id: `${id}-hint`, role: 'status' })
    input.setAttribute('aria-describedby', hint.id)

    const submit = el('button', {
        type: 'submit',
        class: 'pc-answer__submit',
    }, 'Check')

    const form = el('form', {
        class: 'pc-answer',
        novalidate: true,
        onSubmit: event => {
            event.preventDefault()

            const raw = input.value
            const cents = parseAnswer(raw)

            if (cents === null) {
                setStatus('hint', 'Type a number, like 35.')
                input.focus()
                return
            }

            onSubmit?.({ cents, raw })
        },
    }, [
        el('label', { class: 'pc-answer__label', for: id }, label),
        el('div', { class: 'pc-answer__row' }, [input, submit]),
        hint,
    ])

    /** `status` is one of 'correct' | 'wrong' | 'hint' | null. */
    function setStatus(status, message = '') {
        form.classList.remove('is-correct', 'is-wrong', 'is-hint')
        if (status) form.classList.add(`is-${status}`)

        hint.textContent = message
        hint.hidden = !message
    }

    return {
        el: form,
        input,
        setStatus,

        update(next = {}) {
            if (next.label !== undefined) form.querySelector('.pc-answer__label').textContent = next.label
            if (next.disabled !== undefined) {
                input.disabled = next.disabled
                submit.disabled = next.disabled
            }
        },

        focus() {
            input.focus()
        },

        clear() {
            input.value = ''
            setStatus(null)
        },

        destroy() {
            form.remove()
        },
    }
}
