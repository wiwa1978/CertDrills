import { beforeEach, describe, expect, it, vi } from "vitest";

const { previewQuestionImport, confirmQuestionImport } = vi.hoisted(() => ({
  previewQuestionImport: vi.fn(),
  confirmQuestionImport: vi.fn(),
}));

vi.mock("@/lib/api/certdrill.server", () => ({
  previewCertDrillAdminQuestionImportServer: previewQuestionImport,
  confirmCertDrillAdminQuestionImportServer: confirmQuestionImport,
}));

import { ApiRequestError } from "@platform/frontend-shared";

import {
  confirmCertDrillQuestionImportAction,
  previewCertDrillQuestionImportAction,
} from "@/modules/certdrill/question-import-actions";
import type { CertDrillQuestionImportPreviewResult } from "@/modules/certdrill/question-import-types";

const certificationId = "22222222-2222-4222-8222-222222222222";

const validDocument = {
  version: 1,
  questions: [
    {
      categoryCode: "identity",
      stem: "Which option is correct?",
      answers: [
        { text: "Correct", isCorrect: true },
        { text: "Wrong", isCorrect: false },
      ],
    },
  ],
};

const validRawJson = JSON.stringify(validDocument);

const validPreview: CertDrillQuestionImportPreviewResult = {
  documentVersion: 1,
  documentHash: "a".repeat(64),
  totals: {
    submitted: 1,
    valid: 1,
    invalid: 0,
    duplicateExisting: 0,
    duplicateBatch: 0,
    selectedByDefault: 1,
  },
  rows: [
    {
      sourceIndex: 0,
      categoryCode: "identity",
      categoryId: "33333333-3333-4333-8333-333333333333",
      stem: "Which option is correct?",
      difficulty: "medium",
      answerCount: 2,
      valid: true,
      duplicate: { existingQuestionIds: [], earlierSourceIndexes: [] },
      selectedByDefault: true,
      errors: [],
    },
  ],
};

function oversizedRawJson() {
  // "é" is 1 UTF-16 code unit but 2 UTF-8 bytes, so this string's `.length` (3,000,000) stays
  // under MAX_QUESTION_IMPORT_BYTES (5,242,880) while its UTF-8 byte length (6,000,000) exceeds
  // it - this exercises the UTF-8 byte-length check rather than a naive string length check.
  return "é".repeat(3_000_000);
}

describe("question import actions", () => {
  beforeEach(() => {
    previewQuestionImport.mockReset();
    confirmQuestionImport.mockReset();
  });

  describe("previewCertDrillQuestionImportAction", () => {
    it("rejects empty raw JSON without calling the API", async () => {
      const result = await previewCertDrillQuestionImportAction({ certificationId, rawJson: "   " });

      expect(result).toEqual({ status: "error", message: "Add question import JSON first." });
      expect(previewQuestionImport).not.toHaveBeenCalled();
    });

    it("rejects raw JSON exceeding the 5 MB UTF-8 byte limit without calling the API", async () => {
      const rawJson = oversizedRawJson();
      const result = await previewCertDrillQuestionImportAction({ certificationId, rawJson });

      expect(result).toEqual({ status: "error", message: "Question import JSON must not exceed 5 MB." });
      expect(previewQuestionImport).not.toHaveBeenCalled();
    });

    it("rejects invalid JSON without calling the API", async () => {
      const result = await previewCertDrillQuestionImportAction({ certificationId, rawJson: "{ not json" });

      expect(result).toEqual({ status: "error", message: "Question import JSON is invalid." });
      expect(previewQuestionImport).not.toHaveBeenCalled();
    });

    it("returns the typed preview on success", async () => {
      previewQuestionImport.mockResolvedValueOnce(validPreview);

      const result = await previewCertDrillQuestionImportAction({ certificationId, rawJson: validRawJson });

      expect(result).toEqual({ status: "preview", preview: validPreview });
      expect(previewQuestionImport).toHaveBeenCalledWith({ certificationId, document: validDocument });
    });

    it("returns an explicit error using the de-prefixed API message on failure", async () => {
      previewQuestionImport.mockRejectedValueOnce(new ApiRequestError({
        status: 400,
        message: "API request failed (400): Must include at least 1 question.",
      }));

      const result = await previewCertDrillQuestionImportAction({ certificationId, rawJson: validRawJson });

      expect(result).toEqual({
        status: "error",
        message: "Must include at least 1 question.",
      });
    });

    it("returns validated document errors for an invalid-document response", async () => {
      previewQuestionImport.mockRejectedValueOnce(new ApiRequestError({
        status: 400,
        message: "API request failed (400): Question import document is invalid.",
        errorCode: "CERTDRILL_ADMIN_INVALID_QUESTION_IMPORT",
        details: [
          { field: "version", message: "Document version must be 1." },
          { field: "questions", message: "Must include at most 500 questions." },
        ],
      }));

      const result = await previewCertDrillQuestionImportAction({ certificationId, rawJson: validRawJson });

      expect(result).toEqual({
        status: "error",
        message: "Question import document is invalid.",
        documentErrors: [
          { field: "version", message: "Document version must be 1." },
          { field: "questions", message: "Must include at most 500 questions." },
        ],
      });
    });

    it("drops malformed invalid-document details instead of trusting them", async () => {
      previewQuestionImport.mockRejectedValueOnce(new ApiRequestError({
        status: 400,
        message: "API request failed (400): Question import document is invalid.",
        errorCode: "CERTDRILL_ADMIN_INVALID_QUESTION_IMPORT",
        details: [{ field: "version" }, "questions", null],
      }));

      const result = await previewCertDrillQuestionImportAction({ certificationId, rawJson: validRawJson });

      expect(result).toEqual({ status: "error", message: "Question import document is invalid." });
    });

    it("ignores document details on unrelated API error codes", async () => {
      previewQuestionImport.mockRejectedValueOnce(new ApiRequestError({
        status: 400,
        message: "API request failed (400): Invalid question import preview payload",
        errorCode: "VALIDATION_FAILED",
        details: [{ field: "certificationId", message: "Certification ID must be a valid UUID." }],
      }));

      const result = await previewCertDrillQuestionImportAction({ certificationId, rawJson: validRawJson });

      expect(result).toEqual({ status: "error", message: "Invalid question import preview payload" });
    });
  });

  describe("confirmCertDrillQuestionImportAction", () => {
    const previewDocumentHash = "b".repeat(64);
    const selectedSourceIndexes = [0];
    const duplicateOverrideSourceIndexes: number[] = [];

    it("rejects empty raw JSON without calling the API", async () => {
      const result = await confirmCertDrillQuestionImportAction({
        certificationId,
        rawJson: "",
        previewDocumentHash,
        selectedSourceIndexes,
        duplicateOverrideSourceIndexes,
      });

      expect(result).toEqual({ status: "error", message: "Add question import JSON first." });
      expect(confirmQuestionImport).not.toHaveBeenCalled();
    });

    it("rejects raw JSON exceeding the 5 MB UTF-8 byte limit without calling the API", async () => {
      const result = await confirmCertDrillQuestionImportAction({
        certificationId,
        rawJson: oversizedRawJson(),
        previewDocumentHash,
        selectedSourceIndexes,
        duplicateOverrideSourceIndexes,
      });

      expect(result).toEqual({ status: "error", message: "Question import JSON must not exceed 5 MB." });
      expect(confirmQuestionImport).not.toHaveBeenCalled();
    });

    it("rejects invalid JSON without calling the API", async () => {
      const result = await confirmCertDrillQuestionImportAction({
        certificationId,
        rawJson: "not json",
        previewDocumentHash,
        selectedSourceIndexes,
        duplicateOverrideSourceIndexes,
      });

      expect(result).toEqual({ status: "error", message: "Question import JSON is invalid." });
      expect(confirmQuestionImport).not.toHaveBeenCalled();
    });

    it("forwards the parsed document, hash, and index arrays to the API", async () => {
      confirmQuestionImport.mockResolvedValueOnce({ importedCount: 1, questionIds: ["question-1"] });

      await confirmCertDrillQuestionImportAction({
        certificationId,
        rawJson: validRawJson,
        previewDocumentHash,
        selectedSourceIndexes,
        duplicateOverrideSourceIndexes,
      });

      expect(confirmQuestionImport).toHaveBeenCalledWith({
        certificationId,
        document: validDocument,
        previewDocumentHash,
        selectedSourceIndexes,
        duplicateOverrideSourceIndexes,
      });
    });

    it("returns success with the imported count and question ids", async () => {
      confirmQuestionImport.mockResolvedValueOnce({ importedCount: 1, questionIds: ["question-1"] });

      const result = await confirmCertDrillQuestionImportAction({
        certificationId,
        rawJson: validRawJson,
        previewDocumentHash,
        selectedSourceIndexes,
        duplicateOverrideSourceIndexes,
      });

      expect(result).toEqual({ status: "success", importedCount: 1, questionIds: ["question-1"] });
    });

    it("returns a typed conflict with the refreshed preview and a de-prefixed message", async () => {
      confirmQuestionImport.mockRejectedValueOnce(new ApiRequestError({
        status: 409,
        message: "API request failed (409): Question import selection no longer matches the current preview. Review the refreshed preview.",
        errorCode: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
        details: validPreview,
      }));

      const result = await confirmCertDrillQuestionImportAction({
        certificationId,
        rawJson: validRawJson,
        previewDocumentHash,
        selectedSourceIndexes,
        duplicateOverrideSourceIndexes,
      });

      expect(result).toEqual({
        status: "conflict",
        message: "Question import selection no longer matches the current preview. Review the refreshed preview.",
        preview: validPreview,
      });
    });

    it("falls back to a normal error when conflict details are malformed", async () => {
      confirmQuestionImport.mockRejectedValueOnce(new ApiRequestError({
        status: 409,
        message: "API request failed (409): Question import selection no longer matches the current preview. Review the refreshed preview.",
        errorCode: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
        details: { documentVersion: 1, totals: {} },
      }));

      const result = await confirmCertDrillQuestionImportAction({
        certificationId,
        rawJson: validRawJson,
        previewDocumentHash,
        selectedSourceIndexes,
        duplicateOverrideSourceIndexes,
      });

      expect(result).toEqual({
        status: "error",
        message: "Question import selection no longer matches the current preview. Review the refreshed preview.",
      });
    });

    it("falls back to a normal error when conflict details are missing entirely", async () => {
      confirmQuestionImport.mockRejectedValueOnce(new ApiRequestError({
        status: 409,
        message: "API request failed (409): Question import selection no longer matches the current preview. Review the refreshed preview.",
        errorCode: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
      }));

      const result = await confirmCertDrillQuestionImportAction({
        certificationId,
        rawJson: validRawJson,
        previewDocumentHash,
        selectedSourceIndexes,
        duplicateOverrideSourceIndexes,
      });

      expect(result).toEqual({
        status: "error",
        message: "Question import selection no longer matches the current preview. Review the refreshed preview.",
      });
    });

    it("returns validated document errors for an invalid-document response", async () => {
      confirmQuestionImport.mockRejectedValueOnce(new ApiRequestError({
        status: 400,
        message: "API request failed (400): Question import document is invalid.",
        errorCode: "CERTDRILL_ADMIN_INVALID_QUESTION_IMPORT",
        details: [{ field: "document", message: "Unrecognized key: \"extra\"." }],
      }));

      const result = await confirmCertDrillQuestionImportAction({
        certificationId,
        rawJson: validRawJson,
        previewDocumentHash,
        selectedSourceIndexes,
        duplicateOverrideSourceIndexes,
      });

      expect(result).toEqual({
        status: "error",
        message: "Question import document is invalid.",
        documentErrors: [{ field: "document", message: "Unrecognized key: \"extra\"." }],
      });
    });

    it("drops malformed invalid-document details instead of trusting them", async () => {
      confirmQuestionImport.mockRejectedValueOnce(new ApiRequestError({
        status: 400,
        message: "API request failed (400): Question import document is invalid.",
        errorCode: "CERTDRILL_ADMIN_INVALID_QUESTION_IMPORT",
        details: { field: "version", message: "Document version must be 1." },
      }));

      const result = await confirmCertDrillQuestionImportAction({
        certificationId,
        rawJson: validRawJson,
        previewDocumentHash,
        selectedSourceIndexes,
        duplicateOverrideSourceIndexes,
      });

      expect(result).toEqual({ status: "error", message: "Question import document is invalid." });
    });

    it("returns an explicit error and does not claim success on a generic API failure", async () => {
      confirmQuestionImport.mockRejectedValueOnce(new Error("Network unavailable"));

      const result = await confirmCertDrillQuestionImportAction({
        certificationId,
        rawJson: validRawJson,
        previewDocumentHash,
        selectedSourceIndexes,
        duplicateOverrideSourceIndexes,
      });

      expect(result).toEqual({ status: "error", message: "Network unavailable" });
    });

    it("returns a generic error message for unexpected non-Error throws", async () => {
      confirmQuestionImport.mockRejectedValueOnce("unexpected failure");

      const result = await confirmCertDrillQuestionImportAction({
        certificationId,
        rawJson: validRawJson,
        previewDocumentHash,
        selectedSourceIndexes,
        duplicateOverrideSourceIndexes,
      });

      expect(result).toEqual({ status: "error", message: "Question import request failed." });
    });
  });
});
