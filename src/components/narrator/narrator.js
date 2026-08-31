import { el } from '../../lib/dom.js'
import './narrator.css'

/**
 * Narration for the lesson, via the browser's built-in Web Speech API — free,
 * no key, no network.
 *
 * The component owns both the speech and the two controls a kid needs: replay
 * the current line, and mute. It renders the spoken text as well, so the lesson
 * still works with the sound off or on a browser with no speech support.
 *
 * Caveat worth knowing: browsers refuse to speak before the first user gesture.
 * The lesson therefore opens on a "Start" tap rather than auto-playing.
 */
export function createNarrator({ muted = false, rate = 0.9 } = {}) {
    const synth = window.speechSynthesis ?? null
    const supported = Boolean(synth)

    let currentText = ''
    let currentUtterance = null

    const caption = el('p', { class: 'pc-narrator__caption', role: 'status', 'aria-live': 'polite' })

    const replayButton = el('button', {
        type: 'button',
        class: 'pc-narrator__control',
        'aria-label': 'Say it again',
        onClick: () => replay(),
    }, 'Say it again')

    const muteButton = el('button', {
        type: 'button',
        class: 'pc-narrator__control',
        onClick: () => setMuted(!muted),
    })

    const root = el('div', { class: 'pc-narrator' }, [
        caption,
        el('div', { class: 'pc-narrator__controls' }, [replayButton, muteButton]),
    ])

    function renderControls() {
        muteButton.textContent = muted ? 'Sound off' : 'Sound on'
        muteButton.setAttribute('aria-pressed', String(muted))
        replayButton.disabled = muted || !supported || !currentText
    }

    function setMuted(next) {
        muted = next
        if (muted) cancel()
        renderControls()
    }

    function cancel() {
        currentUtterance = null
        if (supported) synth.cancel()
    }

    /**
     * Speak `text` and show it as a caption. Resolves when speech finishes —
     * or immediately when muted or unsupported, so callers can always await it
     * without branching.
     */
    function say(text) {
        currentText = text
        caption.textContent = text
        renderControls()

        if (!supported || muted) return Promise.resolve()

        cancel()

        return new Promise(resolve => {
            const utterance = new SpeechSynthesisUtterance(text)
            utterance.rate = rate
            utterance.lang = 'en-US'

            // Resolve on error too. A failed voice must never stall the lesson.
            utterance.onend = () => resolve()
            utterance.onerror = () => resolve()

            currentUtterance = utterance
            synth.speak(utterance)
        })
    }

    function replay() {
        if (currentText) say(currentText)
    }

    renderControls()

    return {
        el: root,
        say,
        replay,
        cancel,
        setMuted,
        get muted() {
            return muted
        },
        get supported() {
            return supported
        },

        // Speech is global to the page, not to this subtree — removing the
        // element is not enough, the queue has to be cancelled explicitly.
        destroy() {
            cancel()
            root.remove()
        },
    }
}
