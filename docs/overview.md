# Overview

## The product

A single-page web app with three views:

1. **Home** — a menu.
2. **Lesson** — direct instruction plus practice on skip-counting by like denomination (counting a pile of all-nickels by 5s, all-dimes by 10s, and so on).
3. **Bakery** — the multiplayer coin-summing game.

## How this maps to the brief

The assignment ([take-home.html](take-home.html)) has three parts. This app covers parts 2 and 3; part 1 ships alongside it as data.

| Brief | Where it lives |
| --- | --- |
| Part 1 — knowledge graph (10–15 KCs, zero → "sum a handful of coins") | Structured data in the repo plus a rendered diagram. Not a view in this app. |
| Part 2 — one complete lesson for one KC | The **Lesson** view. Chosen KC: *skip-counting by like denomination*. |
| Part 3 — multiplayer practice at the top of the graph | The **Bakery** view. |

Deliverables also include `LEARNING.pdf`, `FRONTEND.pdf`, and `MULTIPLAYER.pdf`. The docs in this folder are the raw material for the second and third of those.

## Home view

A menu with exactly three affordances:

| Control | Behaviour |
| --- | --- |
| **Start Lesson** button | Navigates to `#/lesson`. Always enabled. |
| **Start Bakery** button | Navigates to `#/bakery`. **Disabled until the lesson is complete.** When disabled it explains why rather than just greying out. |
| **Join Bakery** — text field + button | The field takes a room code; the button navigates to `#/bakery?code=XXXX` to join another player's room. |

### The unlock rule

"Start Bakery" reads a single persisted flag: the lesson's completion state. The brief says the multiplayer game "unlocks when the lesson is complete," so the gate is real, not cosmetic — the Bakery view itself must also refuse to *host* a room if that flag is unset, so a hand-typed `#/bakery` URL cannot bypass the menu.

**Join Bakery is not gated.** A kid invited into a friend's room should be able to accept. This is how the guard in `src/routes.js` is written today: `/bakery` with a `?code=` is allowed through, `/bakery` without one is not. Still worth confirming — see [Open questions](#open-questions).

## Lesson view

Constraints inherited from the brief:

- **Direct instruction, narrated.** Free TTS is acceptable — the Web Speech API (`speechSynthesis`) is built into the browser and needs no key.
- **Ends with 10 problems** testing mastery of the lesson.
- **No multiple choice.** Every answer is a typed response.
- **On failure, detect what went wrong and where the student needs help.** Detection only — remediation itself is out of scope.

That last point is the interesting one and drives the design: each of the 10 problems is tagged with the sub-skill it exercises, and every wrong answer is classified (off-by-one-coin, counted by 1s instead of by denomination, used the wrong denomination's value, transposed digits, and so on). The output of the lesson is a diagnostic report, not just a score.

## Bakery view

The multiplayer coin-summing game. Two or more students in a shared room, joined by code. The game design is not fixed yet; the brief's examples are racing at a cash register or cooperatively serving customers.

What *is* fixed: it needs a lightweight backend, and rooms are addressed by a short human-typable code, because the Home view's "Join Bakery" field is a code input. Everything else about the transport is deliberately deferred to [multiplayer-contract.md](multiplayer-contract.md).

## Audience constraints

Everything is for a K–2 kid. They can read English. They can type. They know nothing else — no numbers, no counting, no addition, no idea what a coin is. Their prerequisites for *this* lesson are assumed mastered; nothing beyond that is.

Practically, for the frontend: large hit targets, no dense text, no timed pressure in the lesson, audio narration on every instructional beat, and errors that never read as punishment.

## Open questions

- Should **Join Bakery** also be gated on lesson completion, or stay open so an invited kid can always accept?
- Does lesson completion mean *finished the 10 problems* or *passed them at some threshold*? The brief implies failure is expected and diagnosed, which argues for completion = attempted.
- Is lesson progress per-browser (localStorage) or tied to a player identity on the backend?
