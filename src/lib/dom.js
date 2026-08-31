/**
 * Minimal DOM construction helpers. No innerHTML anywhere in the app —
 * room codes and player names arrive off the wire, so everything is built
 * as nodes and set via textContent.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Build an element.
 *
 *   el('button', { class: 'pc-btn', onClick: fn }, 'Start')
 *   el('ul', {}, items.map(i => el('li', {}, i.name)))
 *
 * Props are applied as attributes, except:
 *   - `class`      accepts a string or an array (falsy entries dropped)
 *   - `style`      accepts an object of camelCase properties
 *   - `dataset`    accepts an object of data-* values
 *   - `on*`        registers an event listener (onClick -> 'click')
 *   - boolean-ish  `true` sets the attribute, `false`/`null`/`undefined` omits it
 *
 * Children may be nodes, strings, numbers, or nested arrays. Nullish is skipped.
 */
export function el(tag, props = {}, children = []) {
    const node = document.createElement(tag)
    applyProps(node, props)
    append(node, children)
    return node
}

/** Same as `el`, for SVG elements (which need the namespace). */
export function svg(tag, props = {}, children = []) {
    const node = document.createElementNS(SVG_NS, tag)
    applyProps(node, props)
    append(node, children)
    return node
}

/** Append children to a parent, flattening arrays and skipping nullish. */
export function append(parent, children) {
    const list = Array.isArray(children) ? children : [children]

    for (const child of list) {
        if (child === null || child === undefined || child === false) continue

        if (Array.isArray(child)) {
            append(parent, child)
        } else if (child instanceof Node) {
            parent.appendChild(child)
        } else {
            parent.appendChild(document.createTextNode(String(child)))
        }
    }

    return parent
}

/** Remove every child of a node. */
export function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild)
    return node
}

function applyProps(node, props) {
    for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined || value === false) continue

        if (key.startsWith('on') && typeof value === 'function') {
            node.addEventListener(key.slice(2).toLowerCase(), value)
        } else if (key === 'class') {
            const names = (Array.isArray(value) ? value : [value]).filter(Boolean)
            if (names.length) node.setAttribute('class', names.join(' '))
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(node.style, value)
        } else if (key === 'dataset' && typeof value === 'object') {
            Object.assign(node.dataset, value)
        } else if (key === 'text') {
            node.textContent = String(value)
        } else if (value === true) {
            node.setAttribute(key, '')
        } else {
            node.setAttribute(key, String(value))
        }
    }
}
