"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";

import { Link as LocalizedLink, useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import { questionEditorHref } from "./question-editor-href";
import { compactQuestionId } from "./question-id";
import { questionImportErrorMessage } from "./question-import-error";
import { exceedsQuestionImportByteLimit, QUESTION_IMPORT_TOO_LARGE_MESSAGE } from "./question-import-size";
import {
  areAllQuestionImportDuplicatesIncluded,
  initialQuestionImportSelection,
  isQuestionImportRowDuplicate,
  reconcileQuestionImportSelection,
  setQuestionImportDuplicatesIncluded,
  setQuestionImportRowSelected,
  type QuestionImportSelectionState,
} from "./question-import-selection";
import {
  MAX_QUESTION_IMPORT_BYTES,
  type CertDrillQuestionImportConfirmActionResult,
  type CertDrillQuestionImportFieldError,
  type CertDrillQuestionImportPreviewActionResult,
  type CertDrillQuestionImportPreviewResult,
} from "./question-import-types";

type QuestionImportTab = "upload" | "paste";

type QuestionImportOperation = "preview" | "confirm" | null;

type QuestionImportPreviewAction = (input: {
  certificationId: string;
  rawJson: string;
}) => Promise<CertDrillQuestionImportPreviewActionResult>;

type QuestionImportConfirmAction = (input: {
  certificationId: string;
  rawJson: string;
  previewDocumentHash: string;
  selectedSourceIndexes: number[];
  duplicateOverrideSourceIndexes: number[];
}) => Promise<CertDrillQuestionImportConfirmActionResult>;

type QuestionImportErrorAlertProps = {
  message: string;
  documentErrors: CertDrillQuestionImportFieldError[];
  alertRef?: RefObject<HTMLDivElement | null>;
};

type QuestionImportPreviewDetailsProps = {
  certificationId: string;
  preview: CertDrillQuestionImportPreviewResult;
  selection: QuestionImportSelectionState;
  pending: boolean;
  onToggleDuplicatesIncluded: (included: boolean) => void;
  onToggleRow: (sourceIndex: number, selected: boolean) => void;
};

function importedQuestionsHref(certificationId: string, importedCount: number) {
  return `/admin/certdrill/${certificationId}?tab=questions&imported=${importedCount}`;
}

export function QuestionImportErrorAlert({ message, documentErrors, alertRef }: QuestionImportErrorAlertProps) {
  return (
    <div
      ref={alertRef}
      role="alert"
      tabIndex={-1}
      className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm outline-none"
    >
      <p>{message}</p>
      {documentErrors.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-destructive">
          {documentErrors.map((documentError, index) => (
            <li key={`${documentError.field}-${index}`}>{`${documentError.field}: ${documentError.message}`}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function QuestionImportPreviewDetails({
  certificationId,
  preview,
  selection,
  pending,
  onToggleDuplicatesIncluded,
  onToggleRow,
}: QuestionImportPreviewDetailsProps) {
  const hasDuplicateRows = Boolean(preview.rows.some((row) => row.valid && isQuestionImportRowDuplicate(row)));
  const includeDuplicatesChecked = areAllQuestionImportDuplicatesIncluded(selection, preview.rows);

  return (
    <>
      <div role="status" className="space-y-1 text-sm">
        <ul className="space-y-1">
          <li>{`Submitted: ${preview.totals.submitted}`}</li>
          <li>{`Valid: ${preview.totals.valid}`}</li>
          <li>{`Invalid: ${preview.totals.invalid}`}</li>
          <li>{`Existing duplicates: ${preview.totals.duplicateExisting}`}</li>
          <li>{`Batch duplicates: ${preview.totals.duplicateBatch}`}</li>
          <li>{`Selected: ${selection.selected.length}`}</li>
        </ul>
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id="question-import-include-duplicates"
          aria-label="Include duplicates"
          checked={includeDuplicatesChecked}
          disabled={pending || !hasDuplicateRows}
          onCheckedChange={(checked) => onToggleDuplicatesIncluded(checked === true)}
        />
        <div className="space-y-1">
          <Label htmlFor="question-import-include-duplicates">Include duplicates</Label>
          <p className="text-sm text-muted-foreground">
            Selecting this includes rows flagged as duplicates, so you can intentionally import duplicate questions.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><span className="sr-only">Select</span></TableHead>
              <TableHead>Row</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Stem</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead>Answers</TableHead>
              <TableHead>Validation</TableHead>
              <TableHead>Duplicates</TableHead>
              <TableHead>Errors</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.rows.map((row) => {
              const rowNumber = row.sourceIndex + 1;
              const isDuplicate = isQuestionImportRowDuplicate(row);

              return (
                <TableRow key={row.sourceIndex}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Import row ${rowNumber}`}
                      checked={selection.selected.includes(row.sourceIndex)}
                      disabled={pending || !row.valid}
                      onCheckedChange={(checked) => onToggleRow(row.sourceIndex, checked === true)}
                    />
                  </TableCell>
                  <TableCell>{rowNumber}</TableCell>
                  <TableCell className="whitespace-normal">{row.categoryCode}</TableCell>
                  <TableCell className="max-w-md whitespace-normal">{row.stem}</TableCell>
                  <TableCell><Badge variant="secondary">{row.difficulty}</Badge></TableCell>
                  <TableCell>{row.answerCount}</TableCell>
                  <TableCell>
                    <Badge variant={row.valid ? "outline" : "destructive"}>
                      {row.valid ? "Valid" : "Invalid"}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {isDuplicate ? (
                      <div className="space-y-1">
                        {row.duplicate.existingQuestionIds.length > 0 ? (
                          <p>
                            {"Matches existing question(s): "}
                            {row.duplicate.existingQuestionIds.map((questionId, index) => (
                              <span key={questionId}>
                                {index > 0 ? ", " : ""}
                                <LocalizedLink
                                  href={questionEditorHref(certificationId, questionId)}
                                  className="underline underline-offset-2"
                                >
                                  <span className="sr-only">Question {questionId}</span>
                                  <span aria-hidden="true">{compactQuestionId(questionId)}</span>
                                </LocalizedLink>
                              </span>
                            ))}
                          </p>
                        ) : null}
                        {row.duplicate.earlierSourceIndexes.length > 0 ? (
                          <p>
                            {`Duplicates earlier row(s) ${row.duplicate.earlierSourceIndexes.map((earlierIndex) => earlierIndex + 1).join(", ")} in this document.`}
                          </p>
                        ) : null}
                      </div>
                    ) : <span className="text-muted-foreground">None</span>}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {row.errors.length > 0 ? (
                      <ul className="space-y-1 text-destructive">
                        {row.errors.map((error, index) => (
                          <li key={`${error.field}-${index}`}>{`${error.field}: ${error.message}`}</li>
                        ))}
                      </ul>
                    ) : <span className="text-muted-foreground">None</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export function QuestionImportForm({
  certificationId,
  previewAction,
  confirmAction,
}: {
  certificationId: string;
  previewAction: QuestionImportPreviewAction;
  confirmAction: QuestionImportConfirmAction;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<QuestionImportTab>("upload");
  const [rawJson, setRawJson] = useState("");
  const [preview, setPreview] = useState<CertDrillQuestionImportPreviewResult | null>(null);
  const [selection, setSelection] = useState<QuestionImportSelectionState>(() => initialQuestionImportSelection([]));
  const [message, setMessage] = useState<string | null>(null);
  const [documentErrors, setDocumentErrors] = useState<CertDrillQuestionImportFieldError[]>([]);
  const [operation, setOperation] = useState<QuestionImportOperation>(null);
  const [pendingFocus, setPendingFocus] = useState<"preview" | "conflict" | null>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const conflictAlertRef = useRef<HTMLDivElement | null>(null);
  const pending = operation !== null;

  useEffect(() => {
    if (!pendingFocus) return;

    if (pendingFocus === "preview") {
      previewHeadingRef.current?.focus();
    } else {
      conflictAlertRef.current?.focus();
    }
    setPendingFocus(null);
  }, [pendingFocus]);

  function clearPreviewState() {
    setPreview(null);
    setSelection(initialQuestionImportSelection([]));
    setMessage(null);
    setDocumentErrors([]);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    // Capture the file synchronously before the `await` below - React can clear
    // `input.files` once the change event handler yields, so the reference must be
    // grabbed up front rather than re-read from `event.target` after an await.
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    clearPreviewState();

    if (file.size > MAX_QUESTION_IMPORT_BYTES) {
      setMessage(QUESTION_IMPORT_TOO_LARGE_MESSAGE);
      return;
    }

    const text = await file.text();
    setRawJson(text);
  }

  function handleTextareaChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setRawJson(event.target.value);
    clearPreviewState();
  }

  async function handleValidate() {
    if (pending) return;

    // The pasted/edited text is measured in UTF-8 bytes before anything is sent: `file.size` only
    // covers uploads, and multibyte edits can push the document past the limit afterwards. The raw
    // JSON is kept so the admin can trim it down.
    if (exceedsQuestionImportByteLimit(rawJson)) {
      setPreview(null);
      setSelection(initialQuestionImportSelection([]));
      setMessage(QUESTION_IMPORT_TOO_LARGE_MESSAGE);
      setDocumentErrors([]);
      return;
    }

    setOperation("preview");
    setMessage(null);
    setDocumentErrors([]);
    try {
      const result = await previewAction({ certificationId, rawJson });
      if (result.status === "preview") {
        setPreview(result.preview);
        setSelection(initialQuestionImportSelection(result.preview.rows));
        setMessage(null);
        setDocumentErrors([]);
        setPendingFocus("preview");
      } else {
        setPreview(null);
        setSelection(initialQuestionImportSelection([]));
        setMessage(result.message);
        setDocumentErrors(result.documentErrors ?? []);
      }
    } catch (error) {
      // The server action call itself rejected (network, transport, auth, or serialization
      // failure), so no result ever arrived. The raw JSON is left untouched for retry while the
      // stale preview is dropped because it was never revalidated.
      setPreview(null);
      setSelection(initialQuestionImportSelection([]));
      setMessage(questionImportErrorMessage(error));
      setDocumentErrors([]);
    } finally {
      setOperation(null);
    }
  }

  async function handleConfirm() {
    if (pending || !preview || selection.selected.length === 0) return;

    // Same pre-send byte check as preview. Nothing is imported, so the current preview and
    // selection stay on screen for a retry after the document is trimmed.
    if (exceedsQuestionImportByteLimit(rawJson)) {
      setMessage(QUESTION_IMPORT_TOO_LARGE_MESSAGE);
      setDocumentErrors([]);
      setPendingFocus("conflict");
      return;
    }

    setOperation("confirm");
    setMessage(null);
    setDocumentErrors([]);
    try {
      const result = await confirmAction({
        certificationId,
        rawJson,
        previewDocumentHash: preview.documentHash,
        selectedSourceIndexes: selection.selected,
        duplicateOverrideSourceIndexes: selection.duplicateOverrides,
      });

      if (result.status === "success") {
        router.push(importedQuestionsHref(certificationId, result.importedCount));
        router.refresh();
        return;
      }

      if (result.status === "conflict") {
        setPreview(result.preview);
        setSelection(reconcileQuestionImportSelection(selection, result.preview.rows));
        setMessage(result.message);
        setDocumentErrors([]);
        setPendingFocus("conflict");
        return;
      }

      setMessage(result.message);
      setDocumentErrors(result.documentErrors ?? []);
    } catch (error) {
      // The server action call itself rejected, so nothing was imported. The raw JSON and the
      // current preview/selection are preserved so the admin can retry the same import.
      setMessage(questionImportErrorMessage(error));
      setDocumentErrors([]);
      setPendingFocus("conflict");
    } finally {
      setOperation(null);
    }
  }

  function handleToggleRow(sourceIndex: number, selected: boolean) {
    if (!preview) return;
    setSelection((current) => setQuestionImportRowSelected(current, preview.rows, sourceIndex, selected));
  }

  function handleToggleDuplicatesIncluded(included: boolean) {
    if (!preview) return;
    setSelection((current) => setQuestionImportDuplicatesIncluded(current, preview.rows, included));
  }

  return (
    <div className="space-y-4" aria-busy={pending}>
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as QuestionImportTab)}>
        <TabsList>
          <TabsTrigger value="upload">Upload JSON</TabsTrigger>
          <TabsTrigger value="paste">Paste JSON</TabsTrigger>
        </TabsList>
        <TabsContent value="upload" className="space-y-2 pt-3">
          <Label htmlFor="question-import-file">Upload JSON file</Label>
          <input
            id="question-import-file"
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
          />
        </TabsContent>
        <TabsContent value="paste" className="space-y-2 pt-3">
          <p className="text-sm text-muted-foreground">Paste question import JSON directly into the editor below.</p>
        </TabsContent>
      </Tabs>

      <div className="space-y-2">
        <Label htmlFor="question-import-json">Question import JSON</Label>
        <Textarea
          id="question-import-json"
          value={rawJson}
          onChange={handleTextareaChange}
          rows={16}
          className="font-mono text-xs"
        />
      </div>

      {message ? (
        <QuestionImportErrorAlert message={message} documentErrors={documentErrors} alertRef={conflictAlertRef} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleValidate} disabled={pending}>
          {operation === "preview" ? "Validating..." : "Validate and preview"}
        </Button>
        {preview ? (
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={pending || selection.selected.length === 0}
          >
            {operation === "confirm" ? "Importing..." : "Import selected questions"}
          </Button>
        ) : null}
      </div>

      {preview ? (
        <div className="space-y-4 rounded-md border border-green-600/40 bg-green-600/10 p-4">
          <h2 ref={previewHeadingRef} tabIndex={-1} className="font-semibold outline-none">
            Preview ready. Nothing has been imported yet.
          </h2>
          <QuestionImportPreviewDetails
            certificationId={certificationId}
            preview={preview}
            selection={selection}
            pending={pending}
            onToggleDuplicatesIncluded={handleToggleDuplicatesIncluded}
            onToggleRow={handleToggleRow}
          />
        </div>
      ) : null}
    </div>
  );
}
