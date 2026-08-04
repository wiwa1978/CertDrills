"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type ComponentProps,
} from "react";
import { AlertCircle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

type AnswerValue = {
  text: string;
  explanation: string;
  citationUrls: string;
};

const answerIndexes = [0, 1, 2, 3] as const;
type AnswerIndex = typeof answerIndexes[number];
type AnswerValues = Record<AnswerIndex, AnswerValue>;
type QuestionOption = NonNullable<CertDrillAdminQuestion["options"]>[number];
type AnswerOptions = Record<AnswerIndex, QuestionOption | undefined>;

type QuestionFormProps = {
  action: QuestionFormAction;
  submitLabel: string;
  categories: CertDrillAdminCategory[];
  selectedCertificationId: string;
  selectedQuestion?: CertDrillAdminQuestion;
  idPrefix: string;
};

function answerOptions(question?: CertDrillAdminQuestion): AnswerOptions {
  const slots: AnswerOptions = {
    0: undefined,
    1: undefined,
    2: undefined,
    3: undefined,
  };
  const options = question?.options ?? [];
  const sortOrders = options.map((option) => option.sortOrder);
  const hasCanonicalSortOrders =
    sortOrders.every(
      (sortOrder) =>
        Number.isInteger(sortOrder)
        && sortOrder !== undefined
        && sortOrder >= 0
        && sortOrder <= 3,
    )
    && new Set(sortOrders).size === sortOrders.length;

  if (hasCanonicalSortOrders) {
    options.forEach((option) => {
      slots[option.sortOrder as AnswerIndex] = option;
    });
    return slots;
  }

  options
    .map((option, position) => ({ option, position }))
    .sort((left, right) => {
      const leftSortOrder = left.option.sortOrder ?? left.position;
      const rightSortOrder = right.option.sortOrder ?? right.position;
      return leftSortOrder - rightSortOrder || left.position - right.position;
    })
    .slice(0, answerIndexes.length)
    .forEach(({ option }, index) => {
      slots[index as AnswerIndex] = option;
    });

  return slots;
}

function answerValue(
  options: AnswerOptions | undefined,
  index: AnswerIndex,
): AnswerValue {
  const option = options?.[index];
  return {
    text: option?.text ?? "",
    explanation: option?.explanation ?? "",
    citationUrls: option?.citationUrls?.join(", ") ?? "",
  };
}

function initialAnswers(options?: AnswerOptions): AnswerValues {
  return {
    0: answerValue(options, 0),
    1: answerValue(options, 1),
    2: answerValue(options, 2),
    3: answerValue(options, 3),
  };
}

function initialAnswerState(question?: CertDrillAdminQuestion) {
  const options = answerOptions(question);
  const selectedCorrectOption = answerIndexes.find((index) => {
    const option = options[index];
    return option?.isCorrect && option.text.trim();
  });

  return {
    answers: initialAnswers(options),
    correctOption:
      selectedCorrectOption === undefined ? "" : String(selectedCorrectOption),
  };
}

function fieldErrors(state: QuestionFormActionState, fieldName: string) {
  return state.fieldErrors[fieldName] ?? [];
}

function answerHasError(state: QuestionFormActionState, index: AnswerIndex) {
  return Object.keys(state.fieldErrors)
    .some((fieldName) => fieldName.startsWith(`option${index}`));
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
  const [savedAnswerState] = useState(() => initialAnswerState(selectedQuestion));
  const [activeTab, setActiveTab] = useState<QuestionAnswerTab>("overview");
  const [answers, setAnswers] = useState(savedAnswerState.answers);
  const [correctOption, setCorrectOption] = useState(savedAnswerState.correctOption);
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

  const resetNewQuestion = useCallback(() => {
    setActiveTab("overview");
    setAnswers(initialAnswers());
    setCorrectOption("");
    setFieldToFocus(undefined);
    setCategoryId("");
    setStem("");
    setDifficulty("medium");
    setStatus("draft");
  }, []);

  const activateField = useCallback((fieldName: string) => {
    const tab = questionTabForField(fieldName);
    if (tab) setActiveTab(tab);
    setFieldToFocus(fieldName);
  }, []);

  useEffect(() => {
    if (!fieldToFocus) return;

    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(questionFieldId(idPrefix, fieldToFocus));
      if (
        fieldToFocus === "correctOption"
        && target instanceof HTMLInputElement
        && target.disabled
      ) {
        const fallbackTarget = document.getElementById(`${idPrefix}-form`)
          ?.querySelector<HTMLInputElement>('input[name="correctOption"]:not(:disabled)')
          ?? document.getElementById(`${idPrefix}-answers`);
        fallbackTarget?.focus();
      } else {
        target?.focus();
      }
      setFieldToFocus(undefined);
    });

    return () => cancelAnimationFrame(frame);
  }, [activeTab, fieldToFocus, idPrefix]);

  function updateAnswer(
    index: AnswerIndex,
    key: keyof AnswerValue,
    event: ChangeEvent<HTMLTextAreaElement>,
  ) {
    const value = event.currentTarget.value;
    setAnswers((current) => ({
      ...current,
      [index]: { ...current[index], [key]: value },
    }));

    if (key === "text" && !value.trim() && correctOption === String(index)) {
      setCorrectOption("");
    }
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
          answers={answers}
          updateAnswer={updateAnswer}
          correctOption={correctOption}
          setCorrectOption={setCorrectOption}
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
  answers,
  updateAnswer,
  correctOption,
  setCorrectOption,
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
  answers: AnswerValues;
  updateAnswer: (
    index: AnswerIndex,
    key: keyof AnswerValue,
    event: ChangeEvent<HTMLTextAreaElement>,
  ) => void;
  correctOption: string;
  setCorrectOption: (value: string) => void;
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
        answers={answers}
        updateAnswer={updateAnswer}
        correctOption={correctOption}
        setCorrectOption={setCorrectOption}
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
  answers,
  updateAnswer,
  correctOption,
  setCorrectOption,
  activateField,
}: {
  state: QuestionFormActionState;
  idPrefix: string;
  activeTab: QuestionAnswerTab;
  setActiveTab: (tab: QuestionAnswerTab) => void;
  answers: AnswerValues;
  updateAnswer: (
    index: AnswerIndex,
    key: keyof AnswerValue,
    event: ChangeEvent<HTMLTextAreaElement>,
  ) => void;
  correctOption: string;
  setCorrectOption: (value: string) => void;
  activateField: (fieldName: string) => void;
}) {
  const overviewHasError =
    fieldErrors(state, "options").length > 0
    || fieldErrors(state, "correctOption").length > 0;

  return (
    <Card id={`${idPrefix}-answers`} tabIndex={-1}>
      <CardHeader>
        <CardTitle>Answers</CardTitle>
        <CardDescription>
          Add at least two answers. Select the correct answer before publishing.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
              {answerIndexes.map((index) => {
                const hasError = answerHasError(state, index);
                return (
                  <TabsTrigger
                    key={index}
                    value={`answer-${index}`}
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
                {fieldErrors(state, "correctOption").map((message, index) => (
                  <p key={`${message}-${index}`}>{message}</p>
                ))}
              </div>
            ) : null}
            <fieldset
              className="space-y-3"
              aria-describedby={overviewHasError ? `${idPrefix}-answer-errors` : undefined}
            >
              <legend className="text-sm font-medium">Correct answer</legend>
              {answerIndexes.map((index) => {
                const answer = answers[index];
                const entered = Boolean(answer.text.trim());
                return (
                  <div
                    key={index}
                    className="grid gap-3 rounded-md border p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center"
                  >
                    <input
                      id={`${idPrefix}-correct-option-${index}`}
                      type="radio"
                      name="correctOption"
                      value={String(index)}
                      aria-label={`Answer ${index + 1} is the correct answer`}
                      checked={correctOption === String(index)}
                      disabled={!answer.text.trim()}
                      onChange={() => setCorrectOption(String(index))}
                    />
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => activateField(`option${index}Text`)}
                    >
                      <span className="block font-medium">Answer {index + 1}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {entered ? answer.text : "Not entered"}
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

          {answerIndexes.map((index) => {
            const answer = answers[index];
            return (
              <TabsContent
                key={index}
                value={`answer-${index}`}
                forceMount
                className="space-y-4 pt-3 data-[state=inactive]:hidden"
              >
                <MarkdownTextarea
                  id={`${idPrefix}-option-${index}-text`}
                  name={`option${index}Text`}
                  label={`Answer ${index + 1} text`}
                  className="min-h-32"
                  value={answer.text}
                  onChange={(event) => updateAnswer(index, "text", event)}
                  helperText="At least two answer texts are required."
                  errorMessages={fieldErrors(state, `option${index}Text`)}
                />
                <MarkdownTextarea
                  id={`${idPrefix}-option-${index}-explanation`}
                  name={`option${index}Explanation`}
                  label={`Answer ${index + 1} explanation`}
                  className="min-h-32"
                  value={answer.explanation}
                  onChange={(event) => updateAnswer(index, "explanation", event)}
                  helperText="Required before publishing."
                  errorMessages={fieldErrors(state, `option${index}Explanation`)}
                />
                <QuestionTextarea
                  id={`${idPrefix}-option-${index}-citations`}
                  name={`option${index}CitationUrls`}
                  label={`Answer ${index + 1} citation URLs`}
                  value={answer.citationUrls}
                  onChange={(event) => updateAnswer(index, "citationUrls", event)}
                  helperText="Required before publishing. Use comma-separated http, https, or mailto URLs."
                  errorMessages={fieldErrors(state, `option${index}CitationUrls`)}
                />
              </TabsContent>
            );
          })}
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
