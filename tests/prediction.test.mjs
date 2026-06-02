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
