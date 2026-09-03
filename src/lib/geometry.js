/**
 * Shapes that more than one component draws. Pure string maths — nothing here
 * touches the DOM, and nothing here knows what it is being drawn onto.
 */

/**
 * `points` for a five-pointed star centred on the origin, first point straight
 * up. The inner radius is the golden ratio of the outer one, which is the
 * proportion that reads as "a star" rather than as a spiky blob.
 */
export function starPoints(radius, points = 5, innerRatio = 0.382) {
    const step = Math.PI / points
    const coords = []

    for (let i = 0; i < points * 2; i += 1) {
        const r = i % 2 === 0 ? radius : radius * innerRatio
        const angle = -Math.PI / 2 + i * step

        coords.push(`${(Math.cos(angle) * r).toFixed(2)},${(Math.sin(angle) * r).toFixed(2)}`)
    }

    return coords.join(' ')
}
