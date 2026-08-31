import { el } from '../../lib/dom.js'
import './primary-button.css'

/**
 * The app's main button.
 *
 * A disabled button also renders its reason. A K-2 kid cannot infer why a
 * greyed-out control is greyed out, so "Start Bakery" has to say that the
 * lesson comes first.
 */
export function createPrimaryButton({
    label,
    onClick,
    variant = 'blue',
    disabled = false,
    disabledReason = null,
    type = 'button',
}) {
    const button = el('button', {
        type,
        class: ['pc-button', `pc-button--${variant}`],
        onClick: event => {
            if (button.disabled) return
            onClick?.(event)
        },
    }, label)

    const reason = el('p', { class: 'pc-button__reason', role: 'note' })
    const root = el('div', { class: 'pc-button-group' }, [button, reason])

    function update(next = {}) {
        if (next.label !== undefined) button.textContent = next.label

        if (next.disabled !== undefined) {
            button.disabled = next.disabled
            // aria-disabled keeps the button announced rather than skipped.
            button.setAttribute('aria-disabled', String(next.disabled))
        }

        if (next.disabledReason !== undefined) {
            reason.textContent = next.disabledReason ?? ''
            reason.hidden = !next.disabledReason
        }
    }

    update({ disabled, disabledReason })

    return {
        el: root,
        button,
        update,
        destroy() {
            root.remove()
        },
    }
}
