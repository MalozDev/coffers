import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePeriod } from "../lib/finance/periods";

// Fixed clock: Thursday 24 September 2026, 14:30 local
const NOW = new Date(2026, 8, 24, 14, 30, 0, 0);

test("today resolves to a full day window with yesterday as comparison", () => {
  const range = resolvePeriod("today", null, NOW);
  assert.equal(range.key, "today");
  assert.equal(range.label, "Today");
  assert.equal(range.prevLabel, "Yesterday");
  assert.equal(range.start.getTime(), new Date(2026, 8, 24, 0, 0, 0, 0).getTime());
  assert.equal(range.end.getTime(), new Date(2026, 8, 24, 23, 59, 59, 999).getTime());
  assert.equal(range.prevStart.getTime(), new Date(2026, 8, 23, 0, 0, 0, 0).getTime());
  assert.equal(range.prevEnd.getTime(), new Date(2026, 8, 23, 23, 59, 59, 999).getTime());
  assert.equal(range.progress, 1);
});

test("yesterday compares against the day before it", () => {
  const range = resolvePeriod("yesterday", null, NOW);
  assert.equal(range.key, "yesterday");
  assert.equal(range.label, "Yesterday");
  assert.equal(range.prevLabel, "22 Sep");
  assert.equal(range.start.getTime(), new Date(2026, 8, 23, 0, 0, 0, 0).getTime());
  assert.equal(range.end.getTime(), new Date(2026, 8, 23, 23, 59, 59, 999).getTime());
  assert.equal(range.prevEnd.getTime(), new Date(2026, 8, 22, 23, 59, 59, 999).getTime());
});

test("week runs Sunday to Saturday with last week as comparison", () => {
  const range = resolvePeriod("week", null, NOW);
  assert.equal(range.key, "week");
  assert.equal(range.label, "This week");
  assert.equal(range.prevLabel, "Last week");
  assert.equal(range.start.getTime(), new Date(2026, 8, 20, 0, 0, 0, 0).getTime()); // Sun 20 Sep
  assert.equal(range.end.getTime(), new Date(2026, 8, 26, 23, 59, 59, 999).getTime());
  assert.equal(range.prevStart.getTime(), new Date(2026, 8, 13, 0, 0, 0, 0).getTime());
  assert.equal(range.prevEnd.getTime(), new Date(2026, 8, 19, 23, 59, 59, 999).getTime());
  // Mid-window: partial, so pace insights can fire
  assert.ok(range.progress > 0.5 && range.progress < 1, `progress was ${range.progress}`);
});

test("month compares against the real previous calendar month", () => {
  const range = resolvePeriod("month", null, NOW);
  assert.equal(range.key, "month");
  assert.equal(range.label, "September 2026");
  assert.equal(range.prevLabel, "August 2026");
  assert.equal(range.start.getTime(), new Date(2026, 8, 1, 0, 0, 0, 0).getTime());
  assert.equal(range.end.getTime(), new Date(2026, 8, 30, 23, 59, 59, 999).getTime());
  // Not "30 days before September" — August 1..31 exactly
  assert.equal(range.prevStart.getTime(), new Date(2026, 7, 1, 0, 0, 0, 0).getTime());
  assert.equal(range.prevEnd.getTime(), new Date(2026, 7, 31, 23, 59, 59, 999).getTime());
  assert.ok(range.progress > 0.7 && range.progress < 0.85, `progress was ${range.progress}`);
});

test("legacy period values still resolve", () => {
  assert.equal(resolvePeriod("daily", null, NOW).key, "today");
  assert.equal(resolvePeriod("weekly", null, NOW).key, "week");
  assert.equal(resolvePeriod("monthly", null, NOW).label, "September 2026");
  assert.equal(resolvePeriod(null, null, NOW).label, "September 2026");
  assert.equal(resolvePeriod("", null, NOW).key, "month");
  assert.equal(resolvePeriod("monthly", null, NOW).requested, "monthly");
});

test("legacy daily with an explicit date analyses that exact day", () => {
  const range = resolvePeriod("daily", "2026-08-15", NOW);
  assert.equal(range.key, "day");
  assert.equal(range.label, "15 Aug");
  assert.equal(range.prevLabel, "14 Aug");
  assert.equal(range.start.getTime(), new Date(2026, 7, 15, 0, 0, 0, 0).getTime());
  assert.equal(range.end.getTime(), new Date(2026, 7, 15, 23, 59, 59, 999).getTime());
  assert.equal(range.progress, 1);
});

test("past days from another year keep the year in the label", () => {
  const range = resolvePeriod("daily", "2025-01-15", NOW);
  assert.equal(range.key, "day");
  assert.equal(range.label, "15 Jan 2025");
  assert.equal(range.prevLabel, "14 Jan 2025");
});

test("week and month honour an explicit reference date", () => {
  const week = resolvePeriod("week", "2026-09-13", NOW);
  assert.equal(week.label, "Week of 13 Sep");
  assert.equal(week.prevLabel, "Week of 6 Sep");
  assert.equal(week.start.getTime(), new Date(2026, 8, 13, 0, 0, 0, 0).getTime());
  assert.equal(week.progress, 1); // closed historical window

  const month = resolvePeriod("month", "2026-07-15", NOW);
  assert.equal(month.label, "July 2026");
  assert.equal(month.prevLabel, "June 2026");
  assert.equal(month.start.getTime(), new Date(2026, 6, 1, 0, 0, 0, 0).getTime());
  assert.equal(month.end.getTime(), new Date(2026, 6, 31, 23, 59, 59, 999).getTime());
  assert.equal(month.progress, 1);
});

test("every window stays inclusive and ordered", () => {
  for (const key of ["today", "yesterday", "week", "month"]) {
    const range = resolvePeriod(key, null, NOW);
    assert.ok(range.start < range.end, `${key}: start before end`);
    assert.ok(range.prevEnd < range.start, `${key}: previous window fully before current`);
    assert.ok(range.start <= range.end, `${key}: inclusive bounds`);
    assert.ok(range.progress > 0 && range.progress <= 1, `${key}: progress in (0, 1]`);
  }
});
