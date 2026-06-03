import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadPrediction() {
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(readFileSync("prediction.js", "utf8"), context);
  return context.window.LimosPrediction;
}

test("prediction returns null when observations are insufficient", () => {
  const { predictFinalWeight } = loadPrediction();
  const prediction = predictFinalWeight({
    initialWeight: 80,
    heightCm: 175,
    entries: [{ date: "2026-05-16", weight: 79.8 }],
  }, {
    startDate: "2026-05-14",
    today: "2026-06-03",
    targetDate: "2026-09-30",
  });

  assert.equal(prediction, null);
});

test("prediction dampens early steep loss over a long horizon", () => {
  const { predictFinalWeight } = loadPrediction();
  const prediction = predictFinalWeight({
    initialWeight: 84.5,
    heightCm: 175,
    entries: [
      { date: "2026-05-16", weight: 83.6 },
      { date: "2026-05-20", weight: 82.4 },
      { date: "2026-05-26", weight: 80.2 },
      { date: "2026-06-02", weight: 80.2 },
    ],
  }, {
    startDate: "2026-05-14",
    today: "2026-06-03",
    targetDate: "2026-09-30",
  });

  assert.ok(prediction);
  assert.ok(prediction.projectedWeight > 72);
  assert.ok(prediction.projectedWeight < 80.2);
  assert.equal(prediction.model, "damped-ensemble-v2");
});

test("prediction does not project below a height-based healthy lower bound", () => {
  const { predictFinalWeight } = loadPrediction();
  const prediction = predictFinalWeight({
    initialWeight: 74,
    heightCm: 175,
    entries: [
      { date: "2026-05-16", weight: 72 },
      { date: "2026-05-20", weight: 69 },
      { date: "2026-05-26", weight: 65 },
      { date: "2026-06-02", weight: 61 },
    ],
  }, {
    startDate: "2026-05-14",
    today: "2026-06-03",
    targetDate: "2026-09-30",
  });

  assert.ok(prediction);
  assert.ok(prediction.projectedWeight >= 56.7);
});

test("prediction shows a stable fast-loss series after constraining the projection", () => {
  const { predictFinalWeight } = loadPrediction();
  const prediction = predictFinalWeight({
    initialWeight: 84.4,
    heightCm: 179.5,
    entries: [
      { date: "2026-05-14", weight: 84.1 },
      { date: "2026-05-15", weight: 84.1 },
      { date: "2026-05-16", weight: 83.8 },
      { date: "2026-05-17", weight: 83.5 },
      { date: "2026-05-18", weight: 83.6 },
      { date: "2026-05-19", weight: 83.1 },
      { date: "2026-05-20", weight: 82.9 },
      { date: "2026-05-22", weight: 82.5 },
      { date: "2026-05-25", weight: 82 },
      { date: "2026-05-26", weight: 81.8 },
      { date: "2026-05-27", weight: 81.5 },
      { date: "2026-05-28", weight: 81.2 },
      { date: "2026-05-30", weight: 81 },
      { date: "2026-06-02", weight: 80.5 },
      { date: "2026-06-03", weight: 80.9 },
    ],
  }, {
    startDate: "2026-05-14",
    today: "2026-06-03",
    targetDate: "2026-09-30",
  });

  assert.ok(prediction);
  assert.equal(prediction.confidence, "normal");
  assert.ok(prediction.projectedWeight > 73);
  assert.ok(prediction.projectedWeight < 81);
});

test("prediction keeps a high opening weight when the rest of the series is coherent", () => {
  const { predictFinalWeight } = loadPrediction();
  const prediction = predictFinalWeight({
    initialWeight: 88.8,
    heightCm: 180,
    entries: [
      { date: "2026-05-14", weight: 87.6 },
      { date: "2026-05-15", weight: 86 },
      { date: "2026-05-17", weight: 85.9 },
      { date: "2026-05-19", weight: 85.7 },
      { date: "2026-05-20", weight: 85 },
      { date: "2026-05-21", weight: 84.7 },
      { date: "2026-05-25", weight: 84.8 },
      { date: "2026-05-27", weight: 84.2 },
      { date: "2026-05-28", weight: 84.5 },
      { date: "2026-05-31", weight: 83.8 },
      { date: "2026-06-01", weight: 84.6 },
      { date: "2026-06-03", weight: 84.2 },
    ],
  }, {
    startDate: "2026-05-14",
    today: "2026-06-03",
    targetDate: "2026-09-30",
  });

  assert.ok(prediction);
  assert.equal(prediction.confidence, "normal");
  assert.ok(prediction.projectedWeight > 76);
  assert.ok(prediction.projectedWeight < 84.2);
});
