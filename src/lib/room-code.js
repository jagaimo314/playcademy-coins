/**
 * Bakery room codes. Shared by the Home menu's join field and the Bakery view.
 *
 * Kids read these aloud to each other and type them by hand, so the alphabet
 * drops every glyph pair that gets confused: O/0, I/1/L, and S/5.
 */

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRTUVWXYZ23456789'
export const CODE_LENGTH = 4

/** Uppercase, strip anything outside the alphabet, clamp to length. */
export function normalizeCode(input) {
    return String(input ?? '')
        .toUpperCase()
        .split('')
        .filter(char => CODE_ALPHABET.includes(char))
        .slice(0, CODE_LENGTH)
        .join('')
}

export function isValidCode(input) {
    const code = normalizeCode(input)
    return code.length === CODE_LENGTH
}

/**
 * Generate a code. Client-side generation is for the fake adapter and tests
 * only — the real server issues codes so it can guarantee uniqueness.
 */
export function generateCode() {
    const bytes = new Uint32Array(CODE_LENGTH)
    crypto.getRandomValues(bytes)

    return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
}
