type WeightInput = { id: string; weightPct: string | number | null };
type WeightedInput = { id: string; weightPct: string | number };

type MediaAssetInput = { url: string; mimeType?: string; mime_type?: string };

type QuestionValidationInput = {
  mediaAssets: MediaAssetInput[];
  options: Array<{
    isCorrect: boolean;
    explanation: string;
    citationUrls: string[];
    mediaAssets: MediaAssetInput[];
  }>;
};

const SAFE_CITATION_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function validateCategorySiblingWeights(items: WeightInput[]): { valid: true } | { valid: false; total: number; message: string } {
  const weighted = items.filter((item): item is WeightedInput => item.weightPct !== null && item.weightPct !== undefined);

  if (weighted.length === 0) {
    return { valid: true };
  }

  const parsedWeights = weighted.map((item) => parseWeightToHundredths(item.weightPct));
  const total = parsedWeights.reduce((sum, item) => sum + item.hundredths, 0) / 100;

  if (parsedWeights.some((item) => item.isInvalid)) {
    return {
      valid: false,
      total,
      message: "Sibling category weights must be valid numbers.",
    };
  }

  if (parsedWeights.some((item) => item.hasTooManyDecimalPlaces)) {
    return {
      valid: false,
      total: Number(weighted.reduce((sum, item) => sum + Number(item.weightPct), 0).toFixed(10)),
      message: "Sibling category weights must use at most 2 decimal places.",
    };
  }

  if (total <= 100) {
    return { valid: true };
  }

  return {
    valid: false,
    total,
    message: `Sibling category weights must not exceed 100. Current total: ${total}.`,
  };
}

function parseWeightToHundredths(weightPct: string | number) {
  const value = String(weightPct).trim();
  const match = value.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) {
    return { hundredths: 0, hasTooManyDecimalPlaces: false, isInvalid: true };
  }

  const [, whole = "0", decimal = ""] = match;
  const hasTooManyDecimalPlaces = decimal.length > 2;
  const hundredths = Number(whole) * 100 + Number(decimal.padEnd(2, "0").slice(0, 2));

  return { hundredths, hasTooManyDecimalPlaces, isInvalid: false };
}

function getMimeType(asset: MediaAssetInput) {
  return asset.mimeType ?? asset.mime_type ?? "";
}

function isPngOrJpeg(asset: MediaAssetInput) {
  const mimeType = getMimeType(asset).toLowerCase();
  if (mimeType) {
    return mimeType === "image/png" || mimeType === "image/jpeg";
  }

  const pathname = getUrlPathname(asset.url).toLowerCase();
  return pathname.endsWith(".png") || pathname.endsWith(".jpg") || pathname.endsWith(".jpeg");
}

function getUrlPathname(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split(/[?#]/, 1)[0] ?? "";
  }
}

export function validateQuestionForPublish(input: QuestionValidationInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const correctCount = input.options.filter((option) => option.isCorrect).length;

  if (correctCount !== 1) {
    errors.push("Exactly one answer option must be correct.");
  }

  input.options.forEach((option, index) => {
    const optionNumber = index + 1;

    if (!option.explanation.trim()) {
      errors.push(`Option ${optionNumber} must have a non-empty explanation.`);
    }

    if (option.citationUrls.length === 0) {
      errors.push(`Option ${optionNumber} must have at least one citation URL.`);
    }

    option.citationUrls.forEach((url, citationIndex) => {
      if (!isSafeCitationUrl(url)) {
        errors.push(`Option ${optionNumber} citation URL ${citationIndex + 1} must use http, https, or mailto.`);
      }
    });

    option.mediaAssets.forEach((asset, assetIndex) => {
      if (!isPngOrJpeg(asset)) {
        errors.push(`Option ${optionNumber} media asset ${assetIndex + 1} must be image/png or image/jpeg.`);
      }
    });
  });

  input.mediaAssets.forEach((asset, index) => {
    if (!isPngOrJpeg(asset)) {
      errors.push(`Question media asset ${index + 1} must be image/png or image/jpeg.`);
    }
  });

  return { valid: errors.length === 0, errors };
}

export function isSafeCitationUrl(url: string) {
  try {
    return SAFE_CITATION_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}
