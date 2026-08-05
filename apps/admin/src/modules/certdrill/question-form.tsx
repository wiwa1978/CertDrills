"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type Dispatch,
  type SetStateAction,
} from "react";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  CertDrillAdminCategory,
  CertDrillAdminQuestion,
} from "@/lib/api/certdrill.server";
import { cn } from "@/lib/utils";

import { MarkdownTextarea } from "./markdown";
import {
  answerFieldName,
  MAX_QUESTION_ANSWERS,
  MIN_QUESTION_ANSWERS,
} from "./question-answer-fields";
import {
  addQuestionAnswer,
  cancelQuestionAnswerRemoval,
  confirmQuestionAnswerRemoval,
  createQuestionAnswerState,
  requestQuestionAnswerRemoval,
  updateQuestionAnswer,
  type QuestionAnswerEditorState,
} from "./question-answer-state";
import {
  firstQuestionFieldError,
  questionFieldId,
  questionTabForField,
  type QuestionAnswerTab,
} from "./question-form-navigation";
import { QuestionFormShell } from "./question-form-shell";
import type { QuestionFormActionState } from "./question-form-state";

type QuestionFormAction = (
  previousState: QuestionFormActionState,
  formData: FormData,
) => Promise<QuestionFormActionState>;

type QuestionFormProps = {
  action: QuestionFormAction;
  submitLabel: string;
  categories: CertDrillAdminCategory[];
  selectedCertificationId: string;
  selectedQuestion?: CertDrillAdminQuestion;
  idPrefix: string;
};

function fieldErrors(state: QuestionFormActionState, fieldName: string) {
  return state.fieldErrors[fieldName] ?? [];
}

function nearestAnswerKey(
  answers: QuestionAnswerEditorState["answers"],
  removedKey: string,
) {
  const index = answers.findIndex((answer) => answer.key === removedKey);
  if (index === -1) return undefined;
  return answers[index + 1]?.key ?? answers[index - 1]?.key;
}

type QuestionFieldActivation = {
  tab: QuestionAnswerTab | undefined;
  fieldName: string;
};

export function questionFieldActivation(
  fieldName: string,
  answerKeys: readonly string[],
): QuestionFieldActivation {
  const tab = questionTabForField(fieldName);
  if (tab?.startsWith("answer:")) {
    const answerKey = tab.slice("answer:".length);
    if (!answerKeys.includes(answerKey)) {
      return { tab: "overview", fieldName: "options" };
    }
  }

  return { tab, fieldName };
}

export function QuestionForm({
  action,
  submitLabel,
  categories,
  selectedCertificationId,
  selectedQuestion,
  idPrefix,
}: QuestionFormProps) {
  return (
    <StatefulQuestionForm
      key={selectedQuestion?.id ?? "new"}
      action={action}
      submitLabel={submitLabel}
      categories={categories}
      selectedCertificationId={selectedCertificationId}
      selectedQuestion={selectedQuestion}
      idPrefix={idPrefix}
    />
  );
}

function StatefulQuestionForm({
  action,
  submitLabel,
  categories,
  selectedCertificationId,
  selectedQuestion,
  idPrefix,
}: QuestionFormProps) {
  const [answerState, setAnswerState] = useState(
    () => createQuestionAnswerState(selectedQuestion?.options),
  );
  const [activeTab, setActiveTab] = useState<QuestionAnswerTab>("overview");
  const [fieldToFocus, setFieldToFocus] = useState<string>();
  const [categoryId, setCategoryId] = useState(
    () => selectedQuestion?.categoryId ?? "",
  );
  const [stem, setStem] = useState(() => selectedQuestion?.stem ?? "");
  const [difficulty, setDifficulty] = useState<string>(
    () => selectedQuestion?.difficulty ?? "medium",
  );
  const [status, setStatus] = useState<string>(
    () => selectedQuestion?.status ?? "draft",
  );
  const answerKeysRef = useRef(answerState.answers.map((answer) => answer.key));
  // Keep event handlers synchronized before effects run.
  // eslint-disable-next-line react-hooks/refs
  answerKeysRef.current = answerState.answers.map((answer) => answer.key);
  const resetNewQuestion = useCallback(() => {
    setActiveTab("overview");
    setAnswerState(createQuestionAnswerState());
    setFieldToFocus(undefined);
    setCategoryId("");
    setStem("");
    setDifficulty("medium");
    setStatus("draft");
  }, []);

  const activateField = useCallback((
    fieldName: string,
    explicitAnswers?: QuestionAnswerEditorState["answers"],
  ) => {
    const activation = questionFieldActivation(
      fieldName,
      explicitAnswers
        ? explicitAnswers.map((answer) => answer.key)
        : answerKeysRef.current,
    );
    const { tab } = activation;
    if (tab) setActiveTab(tab);
    setFieldToFocus(activation.fieldName);
  }, []);

  useEffect(() => {
    if (!fieldToFocus) return;

    const frame = requestAnimationFrame(() => {
      if (fieldToFocus === "correctAnswerKey") {
        const form = document.getElementById(`${idPrefix}-form`);
        const checkedCorrectAnswerInput = form?.querySelector<HTMLInputElement>(
          'input[name="correctAnswerKey"]:checked:not(:disabled)',
        );
        const correctAnswerInput = form?.querySelector<HTMLInputElement>(
          'input[name="correctAnswerKey"]:not(:disabled)',
        );
        const correctAnswerGroup = document.getElementById(
          `${idPrefix}-correct-answer`,
        );
        (
          checkedCorrectAnswerInput
          ?? correctAnswerInput
          ?? correctAnswerGroup
        )?.focus();
        setFieldToFocus(undefined);
        return;
      }

      document.getElementById(questionFieldId(idPrefix, fieldToFocus))?.focus();
      setFieldToFocus(undefined);
    });

    return () => cancelAnimationFrame(frame);
  }, [activeTab, fieldToFocus, idPrefix]);

  function handleAddAnswer() {
    const result = addQuestionAnswer(answerState);
    setAnswerState(result.state);
    if (result.addedKey) {
      activateField(
        answerFieldName(result.addedKey, "text"),
        result.state.answers,
      );
    }
  }

  function handleRemoveRequest(answerKey: string) {
    const nextKey = nearestAnswerKey(answerState.answers, answerKey);
    const result = requestQuestionAnswerRemoval(answerState, answerKey);
    setAnswerState(result.state);
    if (result.removed && nextKey) {
      activateField(answerFieldName(nextKey, "text"));
    }
  }

  function handleConfirmRemoval(answerKey: string) {
    const nextKey = nearestAnswerKey(answerState.answers, answerKey);
    setAnswerState(confirmQuestionAnswerRemoval(answerState, answerKey));
    if (nextKey) {
      activateField(answerFieldName(nextKey, "text"));
    }
  }

  function handleCancelRemoval(answerKey: string) {
    setAnswerState(cancelQuestionAnswerRemoval(answerState));
    activateField(answerFieldName(answerKey, "text"));
  }

  return (
    <QuestionFormShell
      action={action}
      submitLabel={submitLabel}
      idPrefix={idPrefix}
      onFieldErrorLink={activateField}
    >
      {(state) => (
        <QuestionFormContents
          state={state}
          idPrefix={idPrefix}
          categories={categories}
          selectedCertificationId={selectedCertificationId}
          selectedQuestion={selectedQuestion}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          stem={stem}
          setStem={setStem}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          status={status}
          setStatus={setStatus}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          answerState={answerState}
          setAnswerState={setAnswerState}
          handleAddAnswer={handleAddAnswer}
          handleRemoveRequest={handleRemoveRequest}
          handleConfirmRemoval={handleConfirmRemoval}
          handleCancelRemoval={handleCancelRemoval}
          activateField={activateField}
          resetNewQuestion={resetNewQuestion}
        />
      )}
    </QuestionFormShell>
  );
}

function QuestionFormContents({
  state,
  idPrefix,
  categories,
  selectedCertificationId,
  selectedQuestion,
  categoryId,
  setCategoryId,
  stem,
  setStem,
  difficulty,
  setDifficulty,
  status,
  setStatus,
  activeTab,
  setActiveTab,
  answerState,
  setAnswerState,
  handleAddAnswer,
  handleRemoveRequest,
  handleConfirmRemoval,
  handleCancelRemoval,
  activateField,
  resetNewQuestion,
}: {
  state: QuestionFormActionState;
  idPrefix: string;
  categories: CertDrillAdminCategory[];
  selectedCertificationId: string;
  selectedQuestion?: CertDrillAdminQuestion;
  categoryId: string;
  setCategoryId: (value: string) => void;
  stem: string;
  setStem: (value: string) => void;
  difficulty: string;
  setDifficulty: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
  activeTab: QuestionAnswerTab;
  setActiveTab: (tab: QuestionAnswerTab) => void;
  answerState: QuestionAnswerEditorState;
  setAnswerState: Dispatch<SetStateAction<QuestionAnswerEditorState>>;
  handleAddAnswer: () => void;
  handleRemoveRequest: (answerKey: string) => void;
  handleConfirmRemoval: (answerKey: string) => void;
  handleCancelRemoval: (answerKey: string) => void;
  activateField: (fieldName: string) => void;
  resetNewQuestion: () => void;
}) {
  useEffect(() => {
    if (state.status !== "error") return;

    const firstField = firstQuestionFieldError(state.fieldErrors);
    if (firstField) activateField(firstField);
  }, [state, activateField]);

  useEffect(() => {
    if (selectedQuestion || state.status !== "success") return;
    resetNewQuestion();
  }, [state, selectedQuestion, resetNewQuestion]);

  return (
    <div className="space-y-4">
      <input type="hidden" name="certificationId" value={selectedCertificationId} />
      {selectedQuestion ? (
        <>
          <input type="hidden" name="questionId" value={selectedQuestion.id} />
          {selectedQuestion.sourceResourceId ? (
            <input
              type="hidden"
              name="sourceResourceId"
              value={selectedQuestion.sourceResourceId}
            />
          ) : null}
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Question details</CardTitle>
          <CardDescription>Choose the category and define the question prompt.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <QuestionSelect
            id={`${idPrefix}-category-id`}
            name="categoryId"
            label="Category"
            required
            value={categoryId}
            onChange={(event) => setCategoryId(event.currentTarget.value)}
            errorMessages={fieldErrors(state, "categoryId")}
          >
            <option value="">Select a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.code} - {category.name}
              </option>
            ))}
          </QuestionSelect>
          <MarkdownTextarea
            id={`${idPrefix}-stem`}
            name="stem"
            label="Stem"
            required
            className="min-h-40"
            placeholder="Which option best answers the scenario?"
            value={stem}
            onChange={(event) => setStem(event.currentTarget.value)}
            helperText="Question stem is required. Markdown is supported."
            errorMessages={fieldErrors(state, "stem")}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <QuestionSelect
              id={`${idPrefix}-difficulty`}
              name="difficulty"
              label="Difficulty"
              value={difficulty}
              onChange={(event) => setDifficulty(event.currentTarget.value)}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </QuestionSelect>
            <QuestionSelect
              id={`${idPrefix}-status`}
              name="status"
              label="Status"
              value={status}
              onChange={(event) => setStatus(event.currentTarget.value)}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </QuestionSelect>
          </div>
        </CardContent>
      </Card>

      <AnswerTabs
        state={state}
        idPrefix={idPrefix}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        answerState={answerState}
        setAnswerState={setAnswerState}
        handleAddAnswer={handleAddAnswer}
        handleRemoveRequest={handleRemoveRequest}
        handleConfirmRemoval={handleConfirmRemoval}
        handleCancelRemoval={handleCancelRemoval}
        activateField={activateField}
      />
    </div>
  );
}

function AnswerTabs({
  state,
  idPrefix,
  activeTab,
  setActiveTab,
  answerState,
  setAnswerState,
  handleAddAnswer,
  handleRemoveRequest,
  handleConfirmRemoval,
  handleCancelRemoval,
  activateField,
}: {
  state: QuestionFormActionState;
  idPrefix: string;
  activeTab: QuestionAnswerTab;
  setActiveTab: (tab: QuestionAnswerTab) => void;
  answerState: QuestionAnswerEditorState;
  setAnswerState: Dispatch<SetStateAction<QuestionAnswerEditorState>>;
  handleAddAnswer: () => void;
  handleRemoveRequest: (answerKey: string) => void;
  handleConfirmRemoval: (answerKey: string) => void;
  handleCancelRemoval: (answerKey: string) => void;
  activateField: (fieldName: string) => void;
}) {
  const overviewHasError =
    fieldErrors(state, "options").length > 0
    || fieldErrors(state, "correctAnswerKey").length > 0;

  return (
    <Card id={`${idPrefix}-answers`} tabIndex={-1}>
      <CardHeader>
        <CardTitle>Answers</CardTitle>
        <CardDescription>
          Add at least two answers. Select the correct answer before publishing.
        </CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="outline"
            onClick={handleAddAnswer}
            disabled={answerState.answers.length >= MAX_QUESTION_ANSWERS}
          >
            Add answer
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <input
          type="hidden"
          name="answerKeys"
          value={answerState.answers.map((answer) => answer.key).join(",")}
        />
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as QuestionAnswerTab)}
        >
          <div className="overflow-x-auto pb-1">
            <TabsList className="w-max min-w-full justify-start">
              <TabsTrigger
                value="overview"
                aria-label={`Overview${overviewHasError ? " has errors" : ""}`}
              >
                Overview
                {overviewHasError ? (
                  <AlertCircle aria-hidden="true" className="text-destructive" />
                ) : null}
              </TabsTrigger>
              {answerState.answers.map((answer, index) => {
                const hasError = Object.keys(state.fieldErrors)
                  .some((fieldName) => fieldName.startsWith(`answer.${answer.key}.`));
                return (
                  <TabsTrigger
                    key={answer.key}
                    value={`answer:${answer.key}`}
                    aria-label={`Answer ${index + 1}${hasError ? " has errors" : ""}`}
                  >
                    Answer {index + 1}
                    {hasError ? (
                      <AlertCircle aria-hidden="true" className="text-destructive" />
                    ) : null}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <TabsContent
            value="overview"
            forceMount
            className="space-y-3 pt-3 data-[state=inactive]:hidden"
          >
            {overviewHasError ? (
              <div
                id={`${idPrefix}-answer-errors`}
                role="alert"
                className="space-y-1 text-sm text-destructive"
              >
                {fieldErrors(state, "options").map((message, index) => (
                  <p key={`${message}-${index}`}>{message}</p>
                ))}
                {fieldErrors(state, "correctAnswerKey").map((message, index) => (
                  <p key={`${message}-${index}`}>{message}</p>
                ))}
              </div>
            ) : null}
            <fieldset
              id={`${idPrefix}-correct-answer`}
              tabIndex={-1}
              className="space-y-3"
              aria-describedby={overviewHasError ? `${idPrefix}-answer-errors` : undefined}
            >
              <legend className="sr-only">Correct answer</legend>
              {answerState.answers.map((answer, index) => {
                const entered = Boolean(answer.text.trim());
                return (
                  <div
                    key={answer.key}
                    className="grid gap-3 rounded-md border p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center"
                  >
                    <input
                      id={`${idPrefix}-correct-${answer.key}`}
                      type="radio"
                      name="correctAnswerKey"
                      value={answer.key}
                      aria-label={`Answer ${index + 1} is the correct answer`}
                      checked={answerState.correctAnswerKey === answer.key}
                      disabled={!answer.text.trim()}
                      onChange={() => setAnswerState({
                        ...answerState,
                        correctAnswerKey: answer.key,
                      })}
                    />
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => activateField(answerFieldName(answer.key, "text"))}
                    >
                      <span className="block font-medium">Answer {index + 1}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {answer.text.trim() || "Not entered"}
                      </span>
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {entered ? "Entered" : "Empty"}
                    </span>
                  </div>
                );
              })}
            </fieldset>
          </TabsContent>

          {answerState.answers.map((answer, index) => (
            <TabsContent
              key={answer.key}
              value={`answer:${answer.key}`}
              forceMount
              className="space-y-4 pt-3 data-[state=inactive]:hidden"
            >
              <MarkdownTextarea
                id={`${idPrefix}-${answer.key}-text`}
                name={answerFieldName(answer.key, "text")}
                label={`Answer ${index + 1} text`}
                className="min-h-32"
                value={answer.text}
                onChange={(event) => setAnswerState((current) => (
                  updateQuestionAnswer(
                    current,
                    answer.key,
                    "text",
                    event.currentTarget.value,
                  )
                ))}
                helperText="At least two answer texts are required."
                errorMessages={fieldErrors(
                  state,
                  answerFieldName(answer.key, "text"),
                )}
              />
              <MarkdownTextarea
                id={`${idPrefix}-${answer.key}-explanation`}
                name={answerFieldName(answer.key, "explanation")}
                label={`Answer ${index + 1} explanation`}
                className="min-h-32"
                value={answer.explanation}
                onChange={(event) => setAnswerState((current) => (
                  updateQuestionAnswer(
                    current,
                    answer.key,
                    "explanation",
                    event.currentTarget.value,
                  )
                ))}
                helperText="Required before publishing."
                errorMessages={fieldErrors(
                  state,
                  answerFieldName(answer.key, "explanation"),
                )}
              />
              <QuestionTextarea
                id={`${idPrefix}-${answer.key}-citations`}
                name={answerFieldName(answer.key, "citationUrls")}
                label={`Answer ${index + 1} citation URLs`}
                value={answer.citationUrls}
                onChange={(event) => setAnswerState((current) => (
                  updateQuestionAnswer(
                    current,
                    answer.key,
                    "citationUrls",
                    event.currentTarget.value,
                  )
                ))}
                helperText="Required before publishing. Use comma-separated http, https, or mailto URLs."
                errorMessages={fieldErrors(
                  state,
                  answerFieldName(answer.key, "citationUrls"),
                )}
              />
              <Button
                type="button"
                variant="destructive"
                onClick={() => handleRemoveRequest(answer.key)}
                disabled={answerState.answers.length <= MIN_QUESTION_ANSWERS}
              >
                Remove answer
              </Button>
              {answerState.pendingRemovalKey === answer.key ? (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/50 p-3"
                >
                  <p>This answer contains content. Remove it permanently?</p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleCancelRemoval(answer.key)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => handleConfirmRemoval(answer.key)}
                    >
                      Remove answer
                    </Button>
                  </div>
                </div>
              ) : null}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

type ErrorProps = {
  errorMessages?: string[];
  helperText?: string;
};

function describedBy(id: string, errorMessages: string[], helperText?: string) {
  return [
    errorMessages.length > 0 ? `${id}-error` : undefined,
    helperText ? `${id}-helper` : undefined,
  ].filter(Boolean).join(" ") || undefined;
}

function QuestionSelect({
  id,
  label,
  errorMessages = [],
  helperText,
  children,
  required,
  className,
  ...props
}: ComponentProps<"select"> & ErrorProps & { id: string; label: string }) {
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="ml-1 text-xs text-muted-foreground">Required</span>
        ) : null}
      </Label>
      <select
        id={id}
        className={cn(
          "border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs",
          className,
        )}
        required={required}
        aria-invalid={errorMessages.length > 0 || undefined}
        aria-describedby={describedBy(id, errorMessages, helperText)}
        {...props}
      >
        {children}
      </select>
      {errorMessages.length > 0 ? (
        <div id={errorId} role="alert" className="space-y-1 text-sm text-destructive">
          {errorMessages.map((message, index) => (
            <p key={`${message}-${index}`}>{message}</p>
          ))}
        </div>
      ) : null}
      {helperText ? (
        <p id={helperId} className="text-xs text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}

function QuestionTextarea({
  id,
  label,
  errorMessages = [],
  helperText,
  required,
  ...props
}: ComponentProps<typeof Textarea> & ErrorProps & { id: string; label: string }) {
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="ml-1 text-xs text-muted-foreground">Required</span>
        ) : null}
      </Label>
      <Textarea
        id={id}
        required={required}
        aria-invalid={errorMessages.length > 0 || undefined}
        aria-describedby={describedBy(id, errorMessages, helperText)}
        {...props}
      />
      {errorMessages.length > 0 ? (
        <div id={errorId} role="alert" className="space-y-1 text-sm text-destructive">
          {errorMessages.map((message, index) => (
            <p key={`${message}-${index}`}>{message}</p>
          ))}
        </div>
      ) : null}
      {helperText ? (
        <p id={helperId} className="text-xs text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}
