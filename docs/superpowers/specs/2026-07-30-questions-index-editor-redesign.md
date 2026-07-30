# Questions index and editor redesign

## Goal

Make the Questions index immediately responsive and let administrators manage each
question from its row, while giving question answers and explanations enough space
to review and edit comfortably.

## Questions index

The index keeps the existing filter dimensions: free-text search, category, status,
difficulty, and sort order.

Search matches the complete loaded question space for the selected certification:
question stem, answer-option text, category, status, and difficulty. Filter changes
apply immediately without an Apply button. Text search uses a short debounce; select
filters update immediately. The current state remains in the URL so it can be shared
or refreshed.

Each row has an Actions menu:

- **Edit** opens the existing dedicated editor route.
- **Publish** appears only for draft questions and uses the existing publish action.
- **Archive** replaces deletion and uses an archive action, preserving history.

The separate Publish question card is removed.

## Question editor

The Question card retains category, stem, difficulty, status, and optional source
resource fields.

The Answers card displays one wide row per answer option. Each row includes:

- Correct-answer selection.
- Answer text editor occupying at least half the available row width.
- Explanation Markdown editor and live preview sharing the remaining half-width
  layout, with the preview never narrower than the editor on desktop.
- Citation URLs below the text and explanation area.

Answer rows stack cleanly on narrow viewports. The correct-answer selector remains
visible before the answer rows.

## Error handling

Archive is only offered for questions that are not already archived. Publish is only
offered for drafts; the existing server action remains the final authority for
publication validation. Dynamic filter state is validated with the existing
normalization rules before it is rendered or placed in the URL.

## Testing

Cover immediate filter URL updates, full-space search matching option text, row
action visibility by status, publish and archive actions, removal of the standalone
publish card, and the answer row's wide desktop layout with explanation preview.
