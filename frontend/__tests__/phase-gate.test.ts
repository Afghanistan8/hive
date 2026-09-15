import { describe, expect, it } from "vitest";
import { gatePhase } from "../lib/hive/format";

describe("gatePhase", () => {
  it("trusts the contract when it says entries are closed but the local clock says open", () => {
    expect(gatePhase("OPEN", "CLOSED")).toEqual({ phase: "CLOSED", contractClosed: true });
    expect(gatePhase("OPEN", "SETTLED")).toEqual({ phase: "SETTLED", contractClosed: true });
  });

  it("keeps the local phase when it is further along than the last contract read", () => {
    expect(gatePhase("READY_TO_SETTLE", "CLOSED")).toEqual({ phase: "READY_TO_SETTLE", contractClosed: false });
    expect(gatePhase("OPEN", "OPEN")).toEqual({ phase: "OPEN", contractClosed: false });
    expect(gatePhase("OPEN", undefined)).toEqual({ phase: "OPEN", contractClosed: false });
  });
});
