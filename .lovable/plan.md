# NECTAR clarification: quick-reply buttons

Today when NECTAR can't act it returns `{ kind: "ask", question }` and the schedule preview just shows the question with a dismiss (X) button — the user has to re-type their whole request to answer. We'll let NECTAR offer **Yes/No** or **a short list of choices**, and let the user click one to send the answer back without retyping.

## UX

In the amber "NECTAR needs more info" card under the command bar:

- If the question is a yes/no, show **Yes** and **No** buttons (Yes = teal, No = outline).
- If NECTAR offers options (e.g. "Wednesday June 10", "Wednesday June 17", "Cancel the shift"), show each as a button.
- Always include a small **"Reply with text…"** affordance that focuses the command bar with the original sentence pre-filled, plus the existing X to dismiss.
- Clicking a button re-runs the NECTAR draft with the original sentence + the user's answer appended (e.g. `…\n\nAnswer: Yes` or `…\n\nAnswer: Move to Wednesday June 10`). NECTAR then returns either a draft (`kind: "ok"`) the user reviews as today, or another `ask` if it needs more.

Nothing else in the flow changes — proposals are still advisory and require Approve & apply.

## Technical

Files touched:

- `src/lib/nectar-schedule-actions.functions.ts`
  - Extend the `ask` variant of `NectarProposal`:
    ```ts
    { kind: "ask"; question: string;
      reply_type?: "yes_no" | "options" | "text";
      options?: { id: string; label: string }[] }
    ```
  - Update the Zod schema (`Ask`) and both LLM prompt blocks to instruct the model: when the answer is binary use `reply_type:"yes_no"`; when there are 2–5 concrete choices use `reply_type:"options"` with short labels; otherwise omit (defaults to free text). Validate `options.length ≤ 5`.
  - `proposeSchedulingActions` already accepts a free-form `sentence`. No signature change — the client just sends the augmented sentence.

- `src/components/schedule-preview/nectar-command-bar.tsx`
  - Track the original sentence that produced the current `proposal` (`askedSentence`).
  - In `ProposalReview` (the `kind === "ask"` branch), render Yes/No or option buttons based on `proposal.reply_type`/`options`. Each button calls a new `answerAsk(label)` that runs the same `propose` mutation with `sentence = askedSentence + "\n\nAnswer: " + label`, then replaces the current proposal with the new result.
  - Add a "Reply with text" link that copies `askedSentence` back into the command input and clears the proposal.
  - Disable buttons while the follow-up request is pending; show a small spinner.

- No DB changes, no new server functions, no migration. Purely an additive field on the existing RPC response plus prompt tweaks.

## Out of scope

- Persisting the question/answer conversation history (still single-turn re-prompts).
- Applying the user's choice directly without re-running NECTAR (we want the engine to re-plan with the new info so guardrails still run).
- Same pattern for other NECTAR surfaces (chat bar, document review) — only the schedule-preview command bar is in scope this turn.
