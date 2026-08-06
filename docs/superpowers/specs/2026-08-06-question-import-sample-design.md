# Question Import Sample and Breadcrumb Fix

## Goal

Make the question import page render without a missing-message error and provide a useful canonical JSON sample that can be given directly to an AI agent.

## Design

- Add `breadcrumb.import` to the English, Dutch, and French message files.
- Extend the existing locale regression test to require the import breadcrumb in every supported locale.
- Expand `apps/admin/public/question-import-example.json` instead of creating a second competing example.
- Include three realistic questions that demonstrate:
  - varied difficulty values;
  - Markdown in question and answer text;
  - exactly one correct answer per question;
  - explanations for every answer;
  - optional citation URLs.
- Keep category codes illustrative. Users or AI agents must replace them with category codes that exist in the selected certification.

## Validation

- Run the targeted admin message-copy test.
- Validate the sample as JSON and run the existing question-import tests that cover the canonical import contract.
