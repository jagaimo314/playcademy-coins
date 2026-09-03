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
    /**
     * Unit glued to the right of the field, e.g. `'¢'`. It joins the
     * accessible name rather than being hidden, so the field is announced as
     * "is worth, cents" — the unit is part of the question, not decoration.
     */
    suffix = null,
    submitLabel = 'Check',
    /** `'row'` sits the button beside the field; `'stacked'` puts it below. */
    variant = 'row',
    onSubmit,
    /**
     * Given, a way to start the question over appears under a wrong answer and
     * nowhere else — the board it left behind is the caller's to clear, which is
     * why this is a callback and not something this component can do alone.
     */
    onRetry = null,
    retryLabel = 'Retry',
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

    const suffixEl = suffix === null
        ? null
        : el('span', { id: `${id}-suffix`, class: 'pc-answer__suffix' }, suffix)

    // The border lives on the wrapper, not the input, so the unit sits inside
    // the same box as the number. Clicks anywhere in it land in the field.
    const field = el('div', {
        class: 'pc-answer__field',
        onClick: () => input.focus(),
    }, [input, suffixEl])

    const labelEl = el('label', { id: `${id}-label`, class: 'pc-answer__label', for: id }, label)

    if (suffixEl) input.setAttribute('aria-labelledby', `${labelEl.id} ${suffixEl.id}`)

    const hint = el('p', { class: 'pc-answer__hint', id: `${id}-hint`, role: 'status' })
    input.setAttribute('aria-describedby', hint.id)

    const submit = el('button', {
        type: 'submit',
        class: 'pc-answer__submit',
    }, submitLabel)

    /*
     * Outside the hint rather than inside it: the hint is a live region, and a
     * button parked in one gets its label read out as part of the status every
     * time the status changes.
     *
     * `type="button"` because it lives in a form and the default is submit —
     * a Retry that checked the answer it was clearing would be a trap.
     */
    const retry = onRetry === null ? null : el('button', {
        type: 'button',
        class: ['pc-button', 'pc-button--quiet', 'pc-answer__retry'],
        hidden: true,
        onClick: () => onRetry(),
    }, retryLabel)

    const form = el('form', {
        class: ['pc-answer', `pc-answer--${variant}`],
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
        labelEl,
        el('div', { class: 'pc-answer__row' }, [field, submit]),
        hint,
        retry,
    ])

    /** `status` is one of 'correct' | 'wrong' | 'hint' | null. */
    function setStatus(status, message = '') {
        form.classList.remove('is-correct', 'is-wrong', 'is-hint')
        if (status) form.classList.add(`is-${status}`)

        hint.textContent = message
        hint.hidden = !message

        // Only a wrong answer has anything to start over from.
        if (retry) retry.hidden = status !== 'wrong'
    }

    return {
        el: form,
        input,
        setStatus,

        update(next = {}) {
            if (next.label !== undefined) labelEl.textContent = next.label
            if (next.disabled !== undefined) {
                input.disabled = next.disabled
                submit.disabled = next.disabled

                // Retry follows the field: while an answer is being checked the
                // message on screen is still the *previous* one, and its button
                // must not reset a puzzle mid-count.
                if (retry) retry.disabled = next.disabled
            }
        },

        focus() {
            input.focus()
        },

        /** Fill the field in. The lesson uses this to model an answer. */
        setValue(value) {
            input.value = String(value)
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
