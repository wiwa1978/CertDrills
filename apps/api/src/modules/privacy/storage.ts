import { BlobServiceClient } from "@azure/storage-blob";

export type PrivacyExportStorage = {
  put(key: string, contents: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
};

type AzureBlobPrivacyExportStorageOptions = {
  connectionString: string;
  containerName: string;
};

function isBlobNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    statusCode?: number;
    code?: string;
    details?: { errorCode?: string };
  };
  return candidate.statusCode === 404
    || candidate.code === "BlobNotFound"
    || candidate.details?.errorCode === "BlobNotFound";
}

export function createAzureBlobPrivacyExportStorage(
  options: AzureBlobPrivacyExportStorageOptions,
): PrivacyExportStorage {
  const container = BlobServiceClient
    .fromConnectionString(options.connectionString)
    .getContainerClient(options.containerName);

  return {
    async put(key, contents) {
      await container.getBlockBlobClient(key).upload(
        contents,
        Buffer.byteLength(contents, "utf8"),
        {
          blobHTTPHeaders: {
            blobContentType: "application/json; charset=utf-8",
          },
        },
      );
    },

    async get(key) {
      try {
        const contents = await container.getBlobClient(key).downloadToBuffer();
        return contents.toString("utf8");
      } catch (error) {
        if (isBlobNotFound(error)) return null;
        throw error;
      }
    },

    async delete(key) {
      await container.getBlobClient(key).deleteIfExists();
    },
  };
}
