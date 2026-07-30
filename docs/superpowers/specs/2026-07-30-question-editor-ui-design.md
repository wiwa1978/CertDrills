# Question editor UI design

## Goal

Make CertDrill question creation and editing focused, discoverable, and clearly
separate question content from answer content.

## Scope

This design replaces the current all-in-one Questions-tab editor with dedicated
full-page routes for creating and editing questions. The Questions tab becomes an
index for finding questions and starting creation.

## User flow

1. An administrator opens the Questions tab for a certification.
2. They filter or browse its question table, or select **Create question**.
3. Create opens `/admin/certdrill/<certificationId>/questions/new`.
4. Selecting an existing question opens
   `/admin/certdrill/<certificationId>/questions/<questionId>`.
5. Both pages render the same editor with certification context retained.

## Editor layout

The page title identifies whether it is creating or editing a question and names the
current certification.

The form has two distinct cards:

### Question

- Required category selection, shown first.
- Required question stem with Markdown preview.
- Difficulty and status controls.

### Answers

- One explicit correct-answer selector.
- Four answer option groups.
- Each group has answer text, Markdown explanation, and citation URLs.

The submit action is visually below the Answers card. Existing update and create
server actions remain responsible for validation and persistence.

## Questions index

The Questions tab contains:

- A primary **Create question** button linking to the creation route.
- Existing filter controls.
- The question table, whose row-level question link opens the editing route.
- The existing publish workflow, separated from creation/editing.

It does not render the full editor inline.

## Error handling

The route confirms that the requested question belongs to the selected
certification. A missing or mismatched ID renders the established empty/not-found
state rather than a form populated from another certification. The category control
remains required, so a form cannot be submitted without a category.

## Testing

Add regression coverage for:

- Create and edit route construction from the Questions index.
- The dedicated editor's Question and Answers section headings.
- Category selection preceding the question stem.
- Prepopulation of an existing question in edit mode.
- Rejection of a question route whose ID is outside the certification.
