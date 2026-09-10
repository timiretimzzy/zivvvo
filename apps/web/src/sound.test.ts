import { describe, expect, it, beforeEach } from "vitest";
import { isSoundMuted, play, setSoundMuted, vibrate } from "./sound";

describe("sound module (node env safety)", () => {
  beforeEach(() => setSoundMuted(false));

  it("starts unmuted", () => {
    expect(isSoundMuted()).toBe(false);
  });

  it("persists the mute flag in memory", () => {
    setSoundMuted(true);
    expect(isSoundMuted()).toBe(true);
    setSoundMuted(false);
    expect(isSoundMuted()).toBe(false);
  });

  it("never throws when audio is unavailable", () => {
    for (const name of ["select", "correct", "wrong", "start", "pass", "fail", "levelUp"] as const) {
      expect(() => play(name)).not.toThrow();
    }
    expect(() => vibrate(20)).not.toThrow();
    expect(() => vibrate([30, 40, 30])).not.toThrow();
  });

  it("no-ops playback while muted", () => {
    setSoundMuted(true);
    expect(() => play("correct")).not.toThrow();
  });
});