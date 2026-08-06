# Question Import Sample Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the missing import breadcrumb translation and expand the downloadable canonical question-import JSON into a useful AI-agent example.

**Architecture:** Keep localization in the existing shared `breadcrumb` namespace and protect locale parity with the current message-copy regression test. Keep one authoritative public JSON example linked by the import page, and test its complete version-1 structure without coupling the test to one specific question.

**Tech Stack:** Next.js 16, next-intl, TypeScript, Vitest, JSON.

---

## File Structure

- `apps/admin/src/messages/en.json`: English import breadcrumb.
- `apps/admin/src/messages/nl.json`: Dutch import breadcrumb.
- `apps/admin/src/messages/fr.json`: French import breadcrumb.
- `apps/admin/tests/messages-copy.test.ts`: supported-locale breadcrumb regression coverage.
- `apps/admin/public/question-import-example.json`: canonical downloadable AI-agent sample.
- `apps/admin/tests/modules/certdrill/question-import-page.test.ts`: canonical sample structure and content coverage.

### Task 1: Add the import breadcrumb to every locale

**Files:**
- Modify: `apps/admin/tests/messages-copy.test.ts:25-40`
- Modify: `apps/admin/src/messages/en.json:1568-1576`
- Modify: `apps/admin/src/messages/nl.json:1568-1576`
- Modify: `apps/admin/src/messages/fr.json:1568-1576`

- [ ] **Step 1: Write the failing locale regression assertion**

Add the import assertion beside the existing CertDrill breadcrumb assertions:

```ts
expect(messages.breadcrumb.certdrill).toBe("CertDrill");
expect(messages.breadcrumb.questions).toBeTruthy();
expect(messages.breadcrumb.new).toBeTruthy();
expect(messages.breadcrumb.import).toBeTruthy();
expect(messages.breadcrumb.operations).toBeTruthy();
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
bun run --cwd apps/admin test tests/messages-copy.test.ts
```

Expected: FAIL because `messages.breadcrumb.import` is undefined.

- [ ] **Step 3: Add translations in all supported locales**

Add the key between `new` and `operations`:

```json
// en.json
"new": "New",
"import": "Import",
"operations": "Operations"
```

```json
// nl.json
"new": "Nieuw",
"import": "Importeren",
"operations": "Bewerkingen"
```

```json
// fr.json
"new": "Nouveau",
"import": "Importer",
"operations": "Opérations"
```

- [ ] **Step 4: Run the test and verify it passes**

Run:

```bash
bun run --cwd apps/admin test tests/messages-copy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the breadcrumb fix**

```bash
git add apps/admin/tests/messages-copy.test.ts apps/admin/src/messages/en.json apps/admin/src/messages/nl.json apps/admin/src/messages/fr.json
git commit -m "fix: add question import breadcrumb translations"
```

### Task 2: Expand and validate the canonical AI-agent sample

**Files:**
- Modify: `apps/admin/tests/modules/certdrill/question-import-page.test.ts:174-210`
- Modify: `apps/admin/public/question-import-example.json`

- [ ] **Step 1: Generalize the sample test and make it require expanded AI guidance**

Replace the example type and assertions with:

```ts
const example = JSON.parse(exampleJson) as {
  version: number;
  questions: Array<{
    categoryCode: string;
    stem: string;
    difficulty: string;
    answers: Array<{
      text: string;
      isCorrect: boolean;
      explanation: string;
      citationUrls: string[];
    }>;
  }>;
};

it("matches the canonical version 1 shape with realistic AI-agent examples", () => {
  expect(example.version).toBe(1);
  expect(example.questions).toHaveLength(3);
  expect(new Set(example.questions.map((question) => question.difficulty))).toEqual(
    new Set(["easy", "medium", "hard"]),
  );
  expect(example.questions.some((question) => question.stem.includes("**"))).toBe(true);

  for (const question of example.questions) {
    expect(question.categoryCode.trim().length).toBeGreaterThan(0);
    expect(question.stem.trim().length).toBeGreaterThan(0);
    expect(question.answers.length).toBeGreaterThanOrEqual(2);
    expect(question.answers.filter((answer) => answer.isCorrect)).toHaveLength(1);
    for (const answer of question.answers) {
      expect(answer.text.trim().length).toBeGreaterThan(0);
      expect(answer.explanation.trim().length).toBeGreaterThan(0);
    }
  }
});

it("only includes safe http(s) citation URLs", () => {
  const citationUrls = example.questions.flatMap((question) =>
    question.answers.flatMap((answer) => answer.citationUrls),
  );
  expect(citationUrls.length).toBeGreaterThan(0);
  for (const url of citationUrls) {
    expect(new URL(url).protocol).toMatch(/^https?:$/);
  }
});
```

- [ ] **Step 2: Run the sample test and verify it fails**

Run:

```bash
bun run --cwd apps/admin test tests/modules/certdrill/question-import-page.test.ts
```

Expected: FAIL because the existing example contains only one medium-difficulty question and no Markdown stem.

- [ ] **Step 3: Replace the public example with three canonical questions**

Use this complete document:

```json
{
  "version": 1,
  "questions": [
    {
      "categoryCode": "SEC-01",
      "stem": "Which principle requires granting an identity only the permissions needed for its current task?",
      "difficulty": "easy",
      "answers": [
        {
          "text": "The principle of least privilege",
          "isCorrect": true,
          "explanation": "Least privilege limits an identity to the minimum permissions needed to perform its assigned task.",
          "citationUrls": ["https://csrc.nist.gov/glossary/term/least_privilege"]
        },
        {
          "text": "Separation of duties",
          "isCorrect": false,
          "explanation": "Separation of duties distributes sensitive responsibilities across multiple people or roles; it does not define the minimum permissions for one identity.",
          "citationUrls": ["https://csrc.nist.gov/glossary/term/separation_of_duty"]
        }
      ]
    },
    {
      "categoryCode": "SEC-01",
      "stem": "A workload currently uses a long-lived administrator credential. Which change best reduces the **blast radius** if that credential is compromised?",
      "difficulty": "medium",
      "answers": [
        {
          "text": "Replace it with a short-lived, least-privilege role credential",
          "isCorrect": true,
          "explanation": "Short validity and narrowly scoped permissions reduce both the duration and impact of credential misuse.",
          "citationUrls": ["https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html"]
        },
        {
          "text": "Store the administrator credential in an encrypted configuration file",
          "isCorrect": false,
          "explanation": "Encryption at rest protects storage, but the workload still receives a powerful long-lived credential that can be stolen while in use.",
          "citationUrls": []
        },
        {
          "text": "Rotate the same administrator credential once per year",
          "isCorrect": false,
          "explanation": "Infrequent rotation does not address excessive privileges and leaves a compromised credential useful for a long period.",
          "citationUrls": []
        }
      ]
    },
    {
      "categoryCode": "SEC-01",
      "stem": "An authorization policy contains `Action: \"*\"` and `Resource: \"*\"`. Which remediation most directly applies **least privilege** while preserving the workload's required behavior?",
      "difficulty": "hard",
      "answers": [
        {
          "text": "Derive the required API actions and resource identifiers from observed workload behavior, then allow only those combinations",
          "isCorrect": true,
          "explanation": "Replacing wildcards with the specific actions and resources the workload needs directly reduces unnecessary authorization.",
          "citationUrls": ["https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html"]
        },
        {
          "text": "Keep both wildcards and add multi-factor authentication to the human administrator account",
          "isCorrect": false,
          "explanation": "MFA strengthens authentication for the administrator but does not reduce the workload policy's authorization scope.",
          "citationUrls": []
        },
        {
          "text": "Keep all actions and restrict access only by source IP address",
          "isCorrect": false,
          "explanation": "A network condition can add defense in depth, but it does not remove unnecessary actions or resource access.",
          "citationUrls": []
        },
        {
          "text": "Copy the wildcard policy into a new role with a different name",
          "isCorrect": false,
          "explanation": "Renaming or relocating the same wildcard permissions does not change their effective privileges.",
          "citationUrls": []
        }
      ]
    }
  ]
}
```

- [ ] **Step 4: Run the focused admin tests**

Run:

```bash
bun run --cwd apps/admin test tests/messages-copy.test.ts tests/modules/certdrill/question-import-page.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run admin type checking**

Run:

```bash
bun run --cwd apps/admin typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 6: Commit the expanded sample**

```bash
git add apps/admin/public/question-import-example.json apps/admin/tests/modules/certdrill/question-import-page.test.ts
git commit -m "docs: expand question import example"
```
