import { MAX_QUESTION_IMPORT_BYTES } from "./question-import-types";

export const QUESTION_IMPORT_TOO_LARGE_MESSAGE = "Question import JSON must not exceed 5 MB.";

// Encoding the whole string at once would allocate a second copy of a multi-megabyte paste, so the
// text is measured in chunks and measuring stops as soon as the limit is exceeded.
const MEASURE_CHUNK_LENGTH = 8192;

const encoder = new TextEncoder();

/**
 * UTF-8 byte length of `value`, counted without allocating an encoded copy of the whole string.
 *
 * `String.length` counts UTF-16 code units, so it undercounts multibyte text: a 3,000,000
 * character string of "é" is only 3,000,000 code units but 6,000,000 UTF-8 bytes.
 *
 * When `limit` is provided, counting stops once the running total exceeds it. The returned value is
 * then only guaranteed to be greater than `limit`, which is all a size check needs.
 */
export function questionImportByteLength(value: string, limit?: number) {
  let bytes = 0;
  let start = 0;

  while (start < value.length) {
    let end = Math.min(start + MEASURE_CHUNK_LENGTH, value.length);
    // Never split a surrogate pair across chunks: each half would otherwise be encoded as a
    // 3-byte replacement character instead of the pair's 4 bytes.
    if (end < value.length && isHighSurrogate(value.charCodeAt(end - 1))) {
      end += 1;
    }

    bytes += encoder.encode(value.slice(start, end)).length;
    if (limit !== undefined && bytes > limit) {
      return bytes;
    }

    start = end;
  }

  return bytes;
}

/** True when the pasted or uploaded JSON is above the accepted document size. */
export function exceedsQuestionImportByteLimit(value: string) {
  return questionImportByteLength(value, MAX_QUESTION_IMPORT_BYTES) > MAX_QUESTION_IMPORT_BYTES;
}

function isHighSurrogate(codeUnit: number) {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}
