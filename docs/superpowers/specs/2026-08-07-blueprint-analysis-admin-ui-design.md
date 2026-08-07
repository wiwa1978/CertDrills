# Blueprint Analysis Admin UI Design

## Goal

Let an administrator start AI blueprint analysis from an eligible resource, follow asynchronous progress automatically, and inspect a read-only category-and-weight proposal in a dialog.

## Scope

This phase includes:

- an Analyze action on eligible resource rows;
- automatic parse-run status polling;
- a dialog for queued, running, completed, failed, and polling-error states;
- a read-only category proposal with confidence, warnings, hierarchy, weights, and evidence;
- access to the newest existing run for each resource after page reload.

This phase does not edit proposals, compare them with existing categories, or write categories to the database.

## Eligibility

Analyze is enabled only when a resource:

- has `status = ingested`;
- has `contentMode = outline_blueprint`;
- has `sourceType = exam-blueprint` or `study-guide`;
- has a persisted successful snapshot, as enforced again by the backend.

Ineligible rows show a disabled Analyze button with concise explanatory text or an accessible description. The frontend eligibility check improves clarity but does not replace backend validation.

## Architecture

The existing Resources table remains server-rendered. A focused `BlueprintAnalysisControl` client component is rendered in each resource row and owns:

- the Analyze button;
- dialog open state;
- the current parse run;
- polling lifecycle;
- retry actions for status-request failures.

The admin server page loads certification parse runs together with categories, questions, exam forms, and resources. It associates the newest run with each resource before rendering the row control.

The admin application adds typed parse-run and proposal models plus server API helpers for the existing backend endpoints:

- `POST /certifications/:certificationId/blueprint-parse-runs`;
- `GET /certifications/:certificationId/blueprint-parse-runs`;
- `GET /blueprint-parse-runs/:id`.

Browser-safe Next.js route handlers proxy start and detail requests through the authenticated server API client. The client component never receives backend credentials.

## User Flow

1. The administrator ingests an eligible study-guide or exam-blueprint resource.
2. The Analyze button becomes enabled.
3. Clicking Analyze creates a new parse run and immediately opens the dialog.
4. The dialog shows `Queued` for `pending` and `Analyzing` for `running`.
5. The client requests run detail every two seconds while the run remains pending or running.
6. Polling stops when the run completes, fails, the dialog closes, navigation unmounts the component, or five minutes elapse.
7. A completed run displays the read-only proposal.
8. A failed run displays the persisted backend error and an Analyze again action.
9. Analyze again creates a new run; it never overwrites prior history.

When the page is loaded with previous runs, the newest run for each resource is available through a View analysis action. A pending or running newest run resumes polling when its dialog opens.

## Dialog Content

The dialog heading identifies the resource and parse status. It includes:

- status badge;
- creation, start, and completion timestamps when available;
- provider and model;
- confidence badge for completed runs;
- warnings in a visible callout;
- persisted error text for failed runs.

Completed proposals use an ordered table with:

- category code;
- category name;
- parent category or `Top level`;
- weight or `Not provided`;
- evidence excerpts and optional source locations.

The proposal order from the backend is preserved. Child categories are visually indented using their validated hierarchy. The dialog is read-only and has no import or save action.

## Polling and Error Handling

Polling uses a two-second interval and one request at a time. A request is not started when a previous request is still unresolved.

Transport or proxy errors:

- stop automatic polling;
- preserve the last known run state;
- display the request error;
- offer Retry status check without creating a new run.

Backend `failed` status:

- displays the persisted parse-run error;
- offers Analyze again;
- creates a distinct historical run when selected.

The five-minute polling limit displays a timeout message and Retry status check. It does not mark the backend run failed.

## Accessibility

Analyze and View analysis buttons include the resource title in their accessible names. The dialog has a title and description, status changes use an appropriate polite live region, disabled controls expose their reason, and evidence content remains keyboard-scrollable.

## Testing

Add focused tests for:

- parse-run server API helpers and proxy route handlers;
- resource eligibility;
- page loading and newest-run association;
- Analyze start behavior;
- pending/running polling with fake timers;
- polling cleanup on terminal status, close, and unmount;
- five-minute timeout behavior;
- completed proposal, hierarchy, weights, warnings, and evidence rendering;
- failed-run Analyze again behavior;
- transport-error Retry status check behavior;
- accessible labels and disabled reasons;
- existing Resources table ingestion behavior remaining intact.

## Future Work

A later phase will add editable proposals, category diffs, merge/replace confirmation, transactional category import, and category provenance.
