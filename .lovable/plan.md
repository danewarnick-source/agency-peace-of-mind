Add a 25-word minimum on each review answer and a scroll-to-bottom gate to the client-specific training viewer. All edits stay inside `src/routes/dashboard.client-training.$clientId.tsx`.

## Change 1 — 25-word minimum per answer

- Add helpers near the top of the file:
  - `const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;`
  - `const MIN_WORDS = 25;`
- Replace the `allAnswered` gate:
  - From: `answers.every((a) => a.answer.trim().length > 0)`
  - To: `answers.every((a) => wordCount(a.answer) >= MIN_WORDS)`
- Under each question's `<Textarea>` (inside the existing `.map`, before the relevance hints), render a live counter: `{wordCount(ans?.answer ?? "")}/{MIN_WORDS} words minimum`, emerald when met, muted otherwise.
- Update the footer hint copy from "Please answer all review questions above before signing." to "Please answer all review questions (at least 25 words each) before signing."

## Change 2 — Scroll-to-bottom gate

- Add `const [contentRead, setContentRead] = useState(false);` next to the existing `useState` calls.
- Add a `scrollRef` (`useRef<HTMLDivElement | null>`) and attach it to the scrollable content container (`flex-1 min-h-0 overflow-y-auto ...`).
- On that container, add:
  ```
  onScroll={(e) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setContentRead(true);
  }}
  ```
- Short-content safety: a `useEffect` keyed on the loaded training checks `scrollHeight <= clientHeight` and auto-sets `contentRead = true` so short trainings remain signable.
- Inside the existing `if (training?.id && training.id !== lastTrainingId)` reset block, also call `setContentRead(false)` so switching training type re-requires scrolling.
- Gate only the Sign & Complete button: append `|| !contentRead` to its `disabled` expression. Answering and the relevance check remain unaffected.
- When `!contentRead`, show a small amber hint above the signature row: "Scroll through the full training above before signing."

## Verification

- Run `tsgo --noEmit`; expect zero errors.
- No other file is created, renamed, moved, or modified.
- Relevance check, training-type switching, completion mutation, attestation text, `GoalsView`/`SectionsView` rendering, the `alreadyCurrent` completed-state UI, and all server functions remain untouched.
