import { describe, expect, it } from "vitest";
import { Agent } from "../core/agent.js";

function agentWithEnabled(enabled) {
  const a = Object.create(Agent.prototype);
  a._cb = { getEngine: () => ({ getWorkflowSettings: () => ({ enabled }) }) };
  return a;
}

describe("agent workflow toggle", () => {
  it("engine settings enabled=true 时 _isWorkflowEnabled 为真", () => {
    expect(agentWithEnabled(true)._isWorkflowEnabled()).toBe(true);
  });
  it("enabled=false 时为假", () => {
    expect(agentWithEnabled(false)._isWorkflowEnabled()).toBe(false);
  });
  it("无 engine / 无 _cb 时安全为假", () => {
    const a = Object.create(Agent.prototype);
    a._cb = {};
    expect(a._isWorkflowEnabled()).toBe(false);
  });
});
