import assert from "node:assert/strict";
import test from "node:test";

import { cloudErrorCategory } from "./cloud.js";

test("cloudErrorCategory identifies blocked and failed browser requests", () => {
  assert.equal(cloudErrorCategory(new TypeError("Failed to fetch")), "network");
  assert.equal(cloudErrorCategory(new Error("net::ERR_BLOCKED_BY_CLIENT")), "network");
  assert.equal(cloudErrorCategory(new Error("Network request failed")), "network");
});

test("cloudErrorCategory identifies timeout errors", () => {
  const error = new Error("Cloud sync timed out");
  error.name = "TimeoutError";
  assert.equal(cloudErrorCategory(error), "timeout");
});

test("cloudErrorCategory leaves service errors unchanged", () => {
  assert.equal(cloudErrorCategory(new Error("permission denied")), "");
});
