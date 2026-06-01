(function () {
  const MIN_OBSERVATIONS = 3;
  const MIN_SPAN_DAYS = 4;
  const DEFAULT_TARGET_DATE = "2026-09-30";

  function predictFinalWeight(participant, options = {}) {
    if (!participant) return null;
    const startDate = options.startDate;
    const today = options.today;
    const targetDate = options.targetDate || DEFAULT_TARGET_DATE;
    if (!isValidISODate(startDate) || !isValidISODate(today) || !isValidISODate(targetDate)) return null;

    const series = buildPredictionSeries(participant, startDate, today);
    if (series.length < (options.minObservations || MIN_OBSERVATIONS)) return null;
    const spanDays = series[series.length - 1].x - series[0].x;
    if (spanDays < (options.minSpanDays || MIN_SPAN_DAYS)) return null;

    const fit = fitRobustWeightTrend(series, options.minObservations || MIN_OBSERVATIONS);
    if (!fit) return null;

    const latest = series[series.length - 1];
    const targetX = daysBetween(startDate, targetDate);
    const daysToTarget = Math.max(0, targetX - latest.x);
    const slope = constrainDailyWeightSlope(fit.slope, latest.y);
    const rawProjectedWeight = latest.y + slope * daysToTarget;
    const bounds = getReasonableWeightBounds(participant);
    const projectedWeight = round1(clamp(rawProjectedWeight, bounds.min, bounds.max));
    const latestRate = calculateLossRate(participant.initialWeight, latest.y);
    const rate = calculateLossRate(participant.initialWeight, projectedWeight);

    return {
      latestRate,
      projectedWeight,
      rate,
      confidence: getPredictionConfidence(series, fit, slope),
      slope,
    };
  }

  function buildPredictionSeries(participant, startDate, today) {
    const byDate = new Map();
    if (isValidWeight(participant.initialWeight)) {
      byDate.set(startDate, {
        date: startDate,
        weight: Number(participant.initialWeight),
      });
    }

    [...(participant.entries || [])]
      .filter((entry) => entry.date <= today && isValidWeight(Number(entry.weight)))
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((entry) => {
        byDate.set(entry.date, {
          date: entry.date,
          weight: Number(entry.weight),
        });
      });

    return [...byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry) => ({
        date: entry.date,
        x: daysBetween(startDate, entry.date),
        y: entry.weight,
      }));
  }

  function fitRobustWeightTrend(series, minObservations) {
    const firstFit = fitWeightedLine(series);
    if (!firstFit) return null;
    const residuals = series.map((point) => Math.abs(point.y - (firstFit.intercept + firstFit.slope * point.x)));
    const medianResidual = median(residuals);
    const mad = median(residuals.map((residual) => Math.abs(residual - medianResidual)));
    const threshold = Math.max(1.2, mad * 2.8);
    const filtered = series.filter((point, index) => residuals[index] <= threshold);
    const finalSeries = filtered.length >= minObservations ? filtered : series;
    const finalFit = fitWeightedLine(finalSeries);
    if (!finalFit) return firstFit;
    return {
      ...finalFit,
      keptCount: finalSeries.length,
      residualMad: mad,
      originalCount: series.length,
    };
  }

  function fitWeightedLine(series) {
    if (series.length < 2) return null;
    const maxX = Math.max(1, series[series.length - 1].x);
    const weighted = series.map((point) => {
      const recency = point.x / maxX;
      return {
        ...point,
        weight: 0.55 + recency * 0.45,
      };
    });
    const weightSum = weighted.reduce((sum, point) => sum + point.weight, 0);
    const meanX = weighted.reduce((sum, point) => sum + point.x * point.weight, 0) / weightSum;
    const meanY = weighted.reduce((sum, point) => sum + point.y * point.weight, 0) / weightSum;
    const numerator = weighted.reduce((sum, point) => sum + point.weight * (point.x - meanX) * (point.y - meanY), 0);
    const denominator = weighted.reduce((sum, point) => sum + point.weight * (point.x - meanX) ** 2, 0);
    if (Math.abs(denominator) < 0.0001) return null;
    const slope = numerator / denominator;
    const intercept = meanY - slope * meanX;
    return { slope, intercept };
  }

  function constrainDailyWeightSlope(slope, currentWeight) {
    const maxDailyLoss = clamp(currentWeight * 0.0018, 0.06, 0.16);
    const maxDailyGain = clamp(currentWeight * 0.0012, 0.04, 0.12);
    return clamp(slope, -maxDailyLoss, maxDailyGain);
  }

  function getReasonableWeightBounds(participant) {
    if (!isValidHeight(participant.heightCm)) return { min: 30, max: 250 };
    const heightMeters = participant.heightCm / 100;
    return {
      min: clamp(round1(16 * heightMeters * heightMeters), 30, 250),
      max: clamp(round1(45 * heightMeters * heightMeters), 30, 250),
    };
  }

  function getPredictionConfidence(series, fit, constrainedSlope) {
    const spanDays = series[series.length - 1].x - series[0].x;
    const slopeWasCapped = Math.abs(fit.slope - constrainedSlope) > 0.005;
    if (series.length < 5 || spanDays < 14 || slopeWasCapped || fit.keptCount < fit.originalCount) return "low";
    return "normal";
  }

  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function calculateLossRate(initialWeight, currentWeight) {
    if (!Number(initialWeight)) return 0;
    return round2(((Number(initialWeight) - currentWeight) / Number(initialWeight)) * 100);
  }

  function daysBetween(startIso, endIso) {
    const start = new Date(`${startIso}T00:00:00+08:00`);
    const end = new Date(`${endIso}T00:00:00+08:00`);
    return Math.max(0, Math.ceil((end - start) / 86400000));
  }

  function isValidISODate(value) {
    const normalized = String(value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
    const [year, month, day] = normalized.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  }

  function isValidWeight(value) {
    return Number.isFinite(value) && value >= 30 && value <= 250;
  }

  function isValidHeight(value) {
    return Number.isFinite(value) && value >= 100 && value <= 230;
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  window.LimosPrediction = {
    predictFinalWeight,
  };
}());
