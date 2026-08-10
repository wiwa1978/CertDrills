type WeightInput = { id: string; weightPct: string | number | null };
type WeightedInput = { id: string; weightPct: string | number };

type MediaAssetInput = { url: string; mimeType?: string; mime_type?: string };
type QuestionInteractionInput =
  | { type: "fill_blank"; acceptedAnswers: string[]; explanation: string; citationUrls: string[] }
  | { type: "matching"; pairs: Array<{ promptId: string; targetId: string; prompt: string; target: string; explanation: string; citationUrls: string[] }> }
  | null;


type QuestionValidationInput = {
  mediaAssets: MediaAssetInput[];
  questionType?: "single_choice" | "fill_blank" | "matching";
  interactionJson?: QuestionInteractionInput;
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
  const questionType = input.questionType ?? "single_choice";

  if (questionType === "single_choice") {
    const correctCount = input.options.filter((option) => option.isCorrect).length;
    if (input.options.length < 2) errors.push("Published questions must have at least two answer options.");
    if (input.options.length > 10) errors.push("Published questions must have at most ten answer options.");
    if (correctCount !== 1) errors.push("Exactly one answer option must be correct.");

    input.options.forEach((option, index) => {
      const optionNumber = index + 1;
      if (!option.explanation.trim()) errors.push(`Option ${optionNumber} must have a non-empty explanation.`);
      validateCitationUrls(option.citationUrls, `Option ${optionNumber}`, errors);
      option.mediaAssets.forEach((asset, assetIndex) => {
        if (!isPngOrJpeg(asset)) errors.push(`Option ${optionNumber} media asset ${assetIndex + 1} must be image/png or image/jpeg.`);
      });
    });
  } else if (questionType === "fill_blank") {
    const interaction = input.interactionJson?.type === "fill_blank" ? input.interactionJson : null;
    if (!interaction) {
      errors.push("Fill-in-the-gap questions require accepted answers.");
    } else {
      const normalized = interaction.acceptedAnswers.map(normalizeAcceptedAnswer);
      if (normalized.length === 0 || normalized.some((answer) => !answer)) errors.push("Fill-in-the-gap questions require at least one non-empty accepted answer.");
      if (new Set(normalized).size !== normalized.length) errors.push("Accepted answers must be unique after case and whitespace normalization.");
      if (!interaction.explanation.trim()) errors.push("Fill-in-the-gap questions require an explanation.");
      validateCitationUrls(interaction.citationUrls, "Fill-in-the-gap answer", errors);
    }
  } else {
    const interaction = input.interactionJson?.type === "matching" ? input.interactionJson : null;
    if (!interaction || interaction.pairs.length < 2) {
      errors.push("Matching questions require at least two pairs.");
    } else {
      if (interaction.pairs.length > 10) errors.push("Matching questions may contain at most ten pairs.");
      if (new Set(interaction.pairs.map((pair) => pair.promptId)).size !== interaction.pairs.length || new Set(interaction.pairs.map((pair) => pair.targetId)).size !== interaction.pairs.length) errors.push("Matching pair identifiers must be unique.");
      interaction.pairs.forEach((pair, index) => {
        const pairNumber = index + 1;
        if (!pair.prompt.trim() || !pair.target.trim()) errors.push(`Matching pair ${pairNumber} requires both prompt and target text.`);
        if (!pair.explanation.trim()) errors.push(`Matching pair ${pairNumber} requires an explanation.`);
        validateCitationUrls(pair.citationUrls, `Matching pair ${pairNumber}`, errors);
      });
    }
  }

  input.mediaAssets.forEach((asset, index) => {
    if (!isPngOrJpeg(asset)) {
      errors.push(`Question media asset ${index + 1} must be image/png or image/jpeg.`);
    }
  });

  return { valid: errors.length === 0, errors };
}

function normalizeAcceptedAnswer(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function validateCitationUrls(urls: string[], label: string, errors: string[]) {
  if (urls.length === 0) errors.push(`${label} must have at least one citation URL.`);
  urls.forEach((url, index) => {
    if (!isSafeCitationUrl(url)) errors.push(`${label} citation URL ${index + 1} must use http, https, or mailto.`);
  });
}

export function isSafeCitationUrl(url: string) {
  try {
    return SAFE_CITATION_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}
