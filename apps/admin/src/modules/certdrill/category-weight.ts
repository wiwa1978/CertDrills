type CategoryWeight = {
  weightPct?: string | number | null;
  weightMinPct?: string | number | null;
  weightMaxPct?: string | number | null;
};

function formatWeightValue(value: string | number) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toString() : String(value);
}

export function formatCategoryWeight(category: CategoryWeight) {
  const { weightPct, weightMinPct, weightMaxPct } = category;

  if (weightMinPct != null && weightMaxPct != null) {
    const minimum = formatWeightValue(weightMinPct);
    const maximum = formatWeightValue(weightMaxPct);
    return minimum === maximum ? `${minimum}%` : `${minimum}–${maximum}%`;
  }

  return weightPct == null ? "-" : `${formatWeightValue(weightPct)}%`;
}
