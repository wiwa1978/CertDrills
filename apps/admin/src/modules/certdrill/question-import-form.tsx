"use client";

import { useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  MAX_QUESTION_IMPORT_BYTES,
  type CertDrillQuestionImportPreviewActionResult,
  type CertDrillQuestionImportPreviewResult,
} from "./question-import-types";

type QuestionImportTab = "upload" | "paste";

type QuestionImportAction = (input: {
  certificationId: string;
  rawJson: string;
}) => Promise<CertDrillQuestionImportPreviewActionResult>;

export function QuestionImportForm({
  certificationId,
  action,
}: {
  certificationId: string;
  action: QuestionImportAction;
}) {
  const [activeTab, setActiveTab] = useState<QuestionImportTab>("upload");
  const [rawJson, setRawJson] = useState("");
  const [preview, setPreview] = useState<CertDrillQuestionImportPreviewResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    // Capture the file synchronously before the `await` below - React can clear
    // `input.files` once the change event handler yields, so the reference must be
    // grabbed up front rather than re-read from `event.target` after an await.
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    setPreview(null);
    setMessage(null);

    if (file.size > MAX_QUESTION_IMPORT_BYTES) {
      setMessage("Question import JSON must not exceed 5 MB.");
      return;
    }

    const text = await file.text();
    setRawJson(text);
  }

  function handleTextareaChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setRawJson(event.target.value);
    setPreview(null);
    setMessage(null);
  }

  async function handleValidate() {
    if (pending) return;

    setPending(true);
    setMessage(null);
    try {
      const result = await action({ certificationId, rawJson });
      if (result.status === "preview") {
        setPreview(result.preview);
        setMessage(null);
      } else {
        setPreview(null);
        setMessage(result.message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
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
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
          {message}
        </div>
      ) : null}

      <Button type="button" onClick={handleValidate} disabled={pending}>
        {pending ? "Validating..." : "Validate and preview"}
      </Button>

      {preview ? (
        <div role="status" className="rounded-md border border-green-600/40 bg-green-600/10 p-4 text-sm">
          <p className="font-semibold">Preview ready. Nothing has been imported yet.</p>
          <ul className="mt-2 space-y-1">
            <li>{`Submitted: ${preview.totals.submitted}`}</li>
            <li>{`Valid: ${preview.totals.valid}`}</li>
            <li>{`Invalid: ${preview.totals.invalid}`}</li>
            <li>{`Existing duplicates: ${preview.totals.duplicateExisting}`}</li>
            <li>{`Batch duplicates: ${preview.totals.duplicateBatch}`}</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
