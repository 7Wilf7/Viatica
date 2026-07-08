import test from "node:test";
import assert from "node:assert/strict";
import {
  getMobilePagerJumpWindow,
  getMobilePagerRenderWindow,
  getMobilePagerTapWindow,
  resolveMobilePagerTouchStart,
  shouldOuterPagerHandleSwipe,
  shouldRenderMobilePagerPane,
} from "./mobilePager.js";

test("keeps edge tabs with their only neighbor", () => {
  assert.deepEqual(getMobilePagerRenderWindow(0, 5), [0, 1]);
  assert.deepEqual(getMobilePagerRenderWindow(4, 5), [3, 4]);
});

test("keeps middle tabs with immediate neighbors pre-mounted", () => {
  assert.deepEqual(getMobilePagerRenderWindow(1, 5), [0, 1, 2]);
  assert.deepEqual(getMobilePagerRenderWindow(2, 5), [1, 2, 3]);
  assert.deepEqual(getMobilePagerRenderWindow(3, 5), [2, 3, 4]);
});

test("keeps crossed panes mounted while settling pager jumps", () => {
  assert.deepEqual(getMobilePagerJumpWindow(0, 4, 5), [0, 1, 2, 3, 4]);
  assert.deepEqual(getMobilePagerJumpWindow(2, 3, 5), [1, 2, 3, 4]);
});

test("keeps bottom-nav tap mounts to current and target panes only", () => {
  assert.deepEqual(getMobilePagerTapWindow(0, 4, 5), [0, 4]);
  assert.deepEqual(getMobilePagerTapWindow(2, 3, 5), [2, 3]);
  assert.deepEqual(getMobilePagerTapWindow(2, 2, 5), [2]);
});

test("supports an action-only center tab outside the swipe sequence", () => {
  const tabs = ["ledger", "calendar", "capture", "assets", "settings"];
  const pagerTabs = tabs.filter((tab) => tab !== "capture");

  assert.deepEqual(pagerTabs, ["ledger", "calendar", "assets", "settings"]);
  assert.equal(pagerTabs[pagerTabs.indexOf("calendar") + 1], "assets");
});

test("always renders the visible tab even if the render window is stale", () => {
  assert.equal(shouldRenderMobilePagerPane(3, [0, 1], 3, 0), true);
  assert.equal(shouldRenderMobilePagerPane(4, [0, 1], 0, 4), true);
  assert.equal(shouldRenderMobilePagerPane(2, [0, 1], 3, 4), false);
});

test("lets nested swipers keep gestures until their boundary", () => {
  assert.equal(shouldOuterPagerHandleSwipe({
    direction: 1,
    currentTab: 0,
    tabCount: 5,
    innerCanMove: true,
  }), false);
  assert.equal(shouldOuterPagerHandleSwipe({
    direction: 1,
    currentTab: 0,
    tabCount: 5,
    innerCanMove: false,
  }), true);
  assert.equal(shouldOuterPagerHandleSwipe({
    direction: -1,
    currentTab: 0,
    tabCount: 5,
    innerCanMove: false,
  }), false);
});

test("starts a new drag from the settle target when the previous settle is interrupted", () => {
  assert.deepEqual(resolveMobilePagerTouchStart({
    visualTab: 2,
    trackLeft: 568,
    width: 400,
    tabCount: 5,
    settleTarget: 2,
  }), {
    current: 2,
    startLeft: 568,
  });

  assert.deepEqual(resolveMobilePagerTouchStart({
    visualTab: 2,
    trackLeft: 1048,
    width: 400,
    tabCount: 5,
    settleTarget: 2,
  }), {
    current: 2,
    startLeft: 1048,
  });
});

test("uses the aligned visual tab when no settle animation is active", () => {
  assert.deepEqual(resolveMobilePagerTouchStart({
    visualTab: 3,
    trackLeft: 1048,
    width: 400,
    tabCount: 5,
  }), {
    current: 3,
    startLeft: 1200,
  });
});
