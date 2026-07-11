import test from "node:test";
import assert from "node:assert/strict";
import {
  hasStateForOwner,
  loadStateForOwner,
  saveStateForOwner,
  storageKeyForOwner,
} from "./storage.js";

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

test("stores signed-out and signed-in ledgers under separate keys", () => {
  const storage = createMemoryStorage();
  saveStateForOwner({
    transactions: [{ id: "local_txn" }],
    budgets: {},
    accounts: [],
    preferences: {},
  }, "", storage);
  saveStateForOwner({
    transactions: [{ id: "user_txn" }],
    budgets: {},
    accounts: [],
    preferences: {},
  }, "user-123", storage);

  assert.equal(storageKeyForOwner(""), "viatica:v1");
  assert.equal(storageKeyForOwner("user-123"), "viatica:v1:user:user-123");
  assert.deepEqual(loadStateForOwner("", storage).transactions.map((txn) => txn.id), ["local_txn"]);
  assert.deepEqual(loadStateForOwner("user-123", storage).transactions.map((txn) => txn.id), ["user_txn"]);
});

test("detects whether an account-specific cache exists", () => {
  const storage = createMemoryStorage();
  assert.equal(hasStateForOwner("user-123", storage), false);
  saveStateForOwner({
    transactions: [],
    budgets: {},
    accounts: [],
    preferences: {},
  }, "user-123", storage);

  assert.equal(hasStateForOwner("user-123", storage), true);
  assert.equal(hasStateForOwner("user-456", storage), false);
});

test("fills missing local preference collections with safe defaults", () => {
  const storage = createMemoryStorage();
  saveStateForOwner({
    transactions: [],
    budgets: {},
    accounts: [],
    preferences: {},
  }, "user-123", storage);

  const preferences = loadStateForOwner("user-123", storage).preferences;
  assert.equal(preferences.startingAssets, 0);
  assert.deepEqual(preferences.projects, []);
});
