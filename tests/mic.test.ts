import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isMicGuardEnabled,
  isMicrophoneBusy,
  waitForMicrophoneFree,
} from "../src/mic.js";

describe("isMicGuardEnabled", () => {
  it("is off without a detector command", () => {
    const prev = process.env.SPEAK_MCP_MIC_BUSY_CMD;
    delete process.env.SPEAK_MCP_MIC_BUSY_CMD;
    try {
      assert.equal(isMicGuardEnabled(), false);
    } finally {
      if (prev !== undefined) process.env.SPEAK_MCP_MIC_BUSY_CMD = prev;
    }
  });

  it("is on when a detector command is set", () => {
    const prev = process.env.SPEAK_MCP_MIC_BUSY_CMD;
    process.env.SPEAK_MCP_MIC_BUSY_CMD = "true";
    try {
      assert.equal(isMicGuardEnabled(), true);
    } finally {
      if (prev === undefined) delete process.env.SPEAK_MCP_MIC_BUSY_CMD;
      else process.env.SPEAK_MCP_MIC_BUSY_CMD = prev;
    }
  });
});

describe("isMicrophoneBusy", () => {
  it("reports free when no detector is configured", async () => {
    assert.equal(await isMicrophoneBusy({ busyCmd: undefined }), false);
  });

  it("reports busy when the detector exits 0", async () => {
    assert.equal(await isMicrophoneBusy({ busyCmd: "exit 0" }), true);
  });

  it("reports free when the detector exits non-zero", async () => {
    assert.equal(await isMicrophoneBusy({ busyCmd: "exit 1" }), false);
  });
});

describe("waitForMicrophoneFree", () => {
  it("returns immediately when the mic is already free", async () => {
    let checks = 0;
    const free = await waitForMicrophoneFree({
      isBusy: async () => {
        checks++;
        return false;
      },
    });
    assert.equal(free, true);
    assert.equal(checks, 1);
  });

  it("waits until the mic frees up, then returns true", async () => {
    let checks = 0;
    const free = await waitForMicrophoneFree({
      pollMs: 1,
      isBusy: async () => checks++ < 2, // busy, busy, then free
    });
    assert.equal(free, true);
    assert.ok(checks >= 3);
  });

  it("gives up after maxWaitMs and returns false", async () => {
    let clock = 0;
    const free = await waitForMicrophoneFree({
      pollMs: 1,
      maxWaitMs: 10,
      isBusy: async () => true, // never frees
      now: () => (clock += 100),
    });
    assert.equal(free, false);
  });
});
