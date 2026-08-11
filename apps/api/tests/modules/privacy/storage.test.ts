import { beforeEach, describe, expect, it, vi } from "vitest";

const azure = vi.hoisted(() => {
  const upload = vi.fn();
  const downloadToBuffer = vi.fn();
  const deleteIfExists = vi.fn();
  const getBlockBlobClient = vi.fn(() => ({ upload }));
  const getBlobClient = vi.fn(() => ({ downloadToBuffer, deleteIfExists }));
  const getContainerClient = vi.fn(() => ({ getBlockBlobClient, getBlobClient }));
  const fromConnectionString = vi.fn(() => ({ getContainerClient }));

  return {
    upload,
    downloadToBuffer,
    deleteIfExists,
    getBlockBlobClient,
    getBlobClient,
    getContainerClient,
    fromConnectionString,
  };
});

vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: { fromConnectionString: azure.fromConnectionString },
}));

import { createAzureBlobPrivacyExportStorage } from "../../../src/modules/privacy/storage";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Azure Blob privacy export storage", () => {
  function createStorage() {
    return createAzureBlobPrivacyExportStorage({
      connectionString: "UseDevelopmentStorage=true",
      containerName: "privacy-exports",
    });
  }
  it("uploads UTF-8 JSON with its content type", async () => {
    azure.upload.mockResolvedValue(undefined);
    const storage = createStorage();
    const contents = JSON.stringify({ name: "Renée" });

    await storage.put("privacy-exports/export-1.json", contents);

    expect(azure.fromConnectionString).toHaveBeenCalledWith("UseDevelopmentStorage=true");
    expect(azure.getContainerClient).toHaveBeenCalledWith("privacy-exports");
    expect(azure.getBlockBlobClient).toHaveBeenCalledWith("privacy-exports/export-1.json");
    expect(azure.upload).toHaveBeenCalledWith(contents, Buffer.byteLength(contents, "utf8"), {
      blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
    });
  });

  it("downloads blob bytes as UTF-8 text", async () => {
    azure.downloadToBuffer.mockResolvedValue(Buffer.from('{"name":"Renée"}', "utf8"));
    const storage = createStorage();

    await expect(storage.get("privacy-exports/export-1.json"))
      .resolves.toBe('{"name":"Renée"}');
  });

  it("maps a missing blob to null", async () => {
    azure.downloadToBuffer.mockRejectedValue({ statusCode: 404, code: "BlobNotFound" });
    const storage = createStorage();

    await expect(storage.get("privacy-exports/missing.json")).resolves.toBeNull();
  });

  it("deletes the blob idempotently", async () => {
    azure.deleteIfExists.mockResolvedValue({ succeeded: true });
    const storage = createStorage();

    await storage.delete("privacy-exports/export-1.json");

    expect(azure.getBlobClient).toHaveBeenCalledWith("privacy-exports/export-1.json");
    expect(azure.deleteIfExists).toHaveBeenCalledOnce();
  });
});
