(function () {
  const MIN_OBSERVATIONS = 3;
  const MIN_SPAN_DAYS = 4;
  const NORMAL_CONFIDENCE_OBSERVATIONS = 5;
  const NORMAL_CONFIDENCE_SPAN_DAYS = 14;
  const DEFAULT_TARGET_DATE = "2026-09-30";

  function predictFinalWeight(participant, options = {}) {
    if (!participant) return null;
    const startDate = options.startDate;
    const today = options.today;
    const targetDate = options.targetDate || DEFAULT_TARGET_DATE;
    if (!isValidISODate(startDate) || !isValidISODate(today) || !isValidISODate(targetDate)) return null;

    const series = buildPredictionSeries(participant, startDate, today);
    if (series.length < (options.minObservations || MIN_OBSERVATIONS)) return null;

    const stats = getSeriesStats(series);
    if (stats.spanDays < (options.minSpanDays || MIN_SPAN_DAYS)) return null;

    const trend = fitEnsembleWeightTrend(series, stats);
    if (!trend) return null;

    const latest = series[series.length - 1];
    const targetX = daysBetween(startDate, targetDate);
    const daysToTarget = Math.max(0, targetX - latest.x);
    const constrainedSlope = constrainDailyWeightSlope(trend.slope, latest.y);
    const reliability = getTrendReliability(series, stats, trend, constrainedSlope);
    const futureDelta = constrainFutureDelta(
      constrainedSlope * getEffectiveProjectionDays(stats, daysToTarget, reliability),
      latest.y,
      daysToTarget,
    );

    const bounds = getReasonableWeightBounds(participant);
    const projectedWeight = round1(clamp(latest.y + futureDelta, bounds.min, bounds.max));
    const latestRate = calculateLossRate(participant.initialWeight, latest.y);
    const rate = calculateLossRate(participant.initialWeight, projectedWeight);
    const uncertainty = getPredictionUncertainty(stats, trend, reliability, daysToTarget);

    return {
      latestRate,
      projectedWeight,
      rate,
      confidence: getPredictionConfidence(series, stats, trend, reliability, constrainedSlope),
      slope: round4(futureDelta / Math.max(1, daysToTarget)),
      rawSlope: round4(trend.slope),
      constrainedSlope: round4(constrainedSlope),
      reliability: round2(reliability),
      range: {
        low: round1(clamp(projectedWeight - uncertainty, bounds.min, bounds.max)),
        high: round1(clamp(projectedWeight + uncertainty, bounds.min, bounds.max)),
      },
      model: "damped-ensemble-v2",
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

  function getSeriesStats(series) {
    const spanDays = series[series.length - 1].x - series[0].x;
    const gaps = [];
    for (let index = 1; index < series.length; index += 1) {
      gaps.push(Math.max(0, series[index].x - series[index - 1].x));
    }
    return {
      count: series.length,
      spanDays,
      coverage: spanDays > 0 ? series.length / (spanDays + 1) : 1,
      maxGapDays: gaps.length ? Math.max(...gaps) : 0,
    };
  }

  function fitEnsembleWeightTrend(series, stats) {
    const fullFit = fitRobustWeightTrend(series, MIN_OBSERVATIONS);
    const theilFit = fitTheilSenLine(series);
    const recentFit = fitRecentWeightTrend(series);
    const totalFit = fitEndpointTrend(series);
    const candidates = [
      fullFit ? { ...fullFit, source: "robust", weight: 0.36 } : null,
      theilFit ? { ...theilFit, source: "theil-sen", weight: 0.30 } : null,
      recentFit ? { ...recentFit, source: "recent", weight: stats.spanDays >= 10 ? 0.24 : 0.14 } : null,
      totalFit ? { ...totalFit, source: "endpoint", weight: 0.10 } : null,
    ].filter(Boolean);

    if (!candidates.length) return null;
    const centerSlope = weightedMedian(candidates.map((item) => ({ value: item.slope, weight: item.weight })));
    const slopeSpread = median(candidates.map((item) => Math.abs(item.slope - centerSlope)));
    const agreementScale = Math.max(0.025, slopeSpread * 2.5);
    const agreedCandidates = candidates
      .map((item) => ({
        ...item,
        agreementWeight: item.weight * clamp(1 - Math.abs(item.slope - centerSlope) / agreementScale, 0.25, 1),
      }));
    const weightSum = agreedCandidates.reduce((sum, item) => sum + item.agreementWeight, 0);
    const slope = agreedCandidates.reduce((sum, item) => sum + item.slope * item.agreementWeight, 0) / weightSum;

    return {
      slope,
      intercept: fullFit?.intercept || theilFit?.intercept || series[0].y,
      slopeSpread,
      residualMad: fullFit?.residualMad || getResidualMad(series, slope),
      keptCount: fullFit?.keptCount || series.length,
      originalCount: series.length,
      sources: agreedCandidates.map((item) => item.source),
    };
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
        weight: 0.5 + recency * 0.5,
      };
    });
    return fitLineWithWeights(weighted);
  }

  function fitRecentWeightTrend(series) {
    const latestX = series[series.length - 1].x;
    const recent = series.filter((point) => latestX - point.x <= 21);
    if (recent.length < 3 || recent[recent.length - 1].x - recent[0].x < 4) return null;
    return fitWeightedLine(recent);
  }

  function fitTheilSenLine(series) {
    const slopes = [];
    for (let i = 0; i < series.length; i += 1) {
      for (let j = i + 1; j < series.length; j += 1) {
        const dx = series[j].x - series[i].x;
        if (dx > 0) slopes.push((series[j].y - series[i].y) / dx);
      }
    }
    if (!slopes.length) return null;
    const slope = median(slopes);
    const intercept = median(series.map((point) => point.y - slope * point.x));
    return { slope, intercept };
  }

  function fitEndpointTrend(series) {
    if (series.length < 2) return null;
    const first = series[0];
    const latest = series[series.length - 1];
    const spanDays = latest.x - first.x;
    if (spanDays <= 0) return null;
    const slope = (latest.y - first.y) / spanDays;
    return {
      slope,
      intercept: latest.y - slope * latest.x,
    };
  }

  function fitLineWithWeights(weighted) {
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
    const maxDailyLoss = clamp(currentWeight * 0.0015, 0.045, 0.13);
    const maxDailyGain = clamp(currentWeight * 0.0009, 0.035, 0.09);
    return clamp(slope, -maxDailyLoss, maxDailyGain);
  }

  function getEffectiveProjectionDays(stats, daysToTarget, reliability) {
    if (daysToTarget <= 0) return 0;
    const observedWindow = stats.spanDays + 14;
    const horizonDamping = observedWindow / (observedWindow + daysToTarget * 0.55);
    const reliabilityMultiplier = 0.72 + reliability * 0.48;
    return daysToTarget * clamp(horizonDamping * reliabilityMultiplier, 0.20, 0.68);
  }

  function constrainFutureDelta(delta, currentWeight, daysToTarget) {
    const maxLoss = Math.min(currentWeight * 0.10, daysToTarget * clamp(currentWeight * 0.0008, 0.035, 0.085));
    const maxGain = Math.min(currentWeight * 0.06, daysToTarget * clamp(currentWeight * 0.00045, 0.025, 0.055));
    return clamp(delta, -maxLoss, maxGain);
  }

  function getReasonableWeightBounds(participant) {
    if (!isValidHeight(participant.heightCm)) {
      const initialWeight = Number(participant.initialWeight);
      if (isValidWeight(initialWeight)) {
        return {
          min: clamp(round1(initialWeight * 0.62), 30, 250),
          max: clamp(round1(initialWeight * 1.35), 30, 250),
        };
      }
      return { min: 30, max: 250 };
    }
    const heightMeters = participant.heightCm / 100;
    return {
      min: clamp(round1(18.5 * heightMeters * heightMeters), 30, 250),
      max: clamp(round1(42 * heightMeters * heightMeters), 30, 250),
    };
  }

  function getTrendReliability(series, stats, trend, constrainedSlope) {
    const observationScore = clamp((series.length - 3) / 7, 0, 1);
    const spanScore = clamp((stats.spanDays - 7) / 35, 0, 1);
    const coverageScore = clamp(stats.coverage / 0.55, 0, 1);
    const gapPenalty = clamp((stats.maxGapDays - 5) / 12, 0, 0.3);
    const noisePenalty = clamp((trend.residualMad || 0) / 1.4, 0, 0.35);
    const agreementPenalty = clamp((trend.slopeSpread || 0) / 0.08, 0, 0.25);
    const capPenalty = Math.abs(trend.slope - constrainedSlope) > 0.02 ? 0.12 : 0;
    return clamp(
      0.28 + observationScore * 0.24 + spanScore * 0.24 + coverageScore * 0.16
        - gapPenalty - noisePenalty - agreementPenalty - capPenalty,
      0.15,
      0.88,
    );
  }

  function getPredictionConfidence(series, stats, trend, reliability, constrainedSlope) {
    if (series.length < NORMAL_CONFIDENCE_OBSERVATIONS) return "low";
    if (stats.spanDays < NORMAL_CONFIDENCE_SPAN_DAYS) return "low";
    if (reliability < 0.48) return "low";
    if (trend.keptCount < trend.originalCount && reliability < 0.58) return "low";
    if (Math.abs(trend.slope - constrainedSlope) > 0.04 && reliability < 0.62) return "low";
    return "normal";
  }

  function getPredictionUncertainty(stats, trend, reliability, daysToTarget) {
    const horizonNoise = Math.sqrt(Math.max(1, daysToTarget)) * 0.05;
    const dataNoise = (trend.residualMad || 0) * 1.3;
    const reliabilityNoise = (1 - reliability) * 2.4;
    const gapNoise = clamp((stats.maxGapDays - 3) * 0.12, 0, 1.4);
    return round1(clamp(0.8 + horizonNoise + dataNoise + reliabilityNoise + gapNoise, 1.2, 6));
  }

  function getResidualMad(series, slope) {
    const intercept = median(series.map((point) => point.y - slope * point.x));
    const residuals = series.map((point) => Math.abs(point.y - (intercept + slope * point.x)));
    return median(residuals.map((residual) => Math.abs(residual - median(residuals))));
  }

  function weightedMedian(items) {
    const sorted = [...items].sort((a, b) => a.value - b.value);
    const total = sorted.reduce((sum, item) => sum + item.weight, 0);
    let cumulative = 0;
    for (const item of sorted) {
      cumulative += item.weight;
      if (cumulative >= total / 2) return item.value;
    }
    return sorted[sorted.length - 1]?.value || 0;
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

  function round4(value) {
    return Math.round(value * 10000) / 10000;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  window.LimosPrediction = {
    predictFinalWeight,
  };
}());
