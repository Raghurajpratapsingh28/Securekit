import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditConfiguration,
  renderHumanReport,
  renderJsonReport,
  detectDeploymentHints,
} from "../dist/index.js";

describe(" audit CLI", () => {
  it("passes a secure default configuration with warnings for missing optional modules", async () => {
    const report = await auditConfiguration({ config: undefined });
    assert.equal(report.exitCode, 1);
    assert.ok(report.score > 0);
    assert.ok(report.checks.some((check) => check.id === "config-valid"));
    assert.ok(report.checks.some((check) => check.id === "headers-enabled"));
    assert.ok(report.checks.some((check) => check.id === "rate-limit-missing"));
  });

  it("passes a production-oriented configuration", async () => {
    const report = await auditConfiguration({
      config: {
        headers: true,
        bodyLimit: "1mb",
        cors: { origins: ["https://example.com"] },
        rateLimit: { limit: 100, window: 60_000 },
        apiKey: {
          validate: async () => ({ id: "k1" }),
        },
      },
      env: {},
    });

    assert.equal(report.exitCode, 0);
    assert.ok(report.score >= 80);
  });

  it("fails invalid configuration at compile time", async () => {
    const report = await auditConfiguration({
      config: {
        cors: { origins: "*", credentials: true },
      },
    });

    assert.equal(report.exitCode, 2);
    assert.ok(report.checks.some((check) => check.severity === "fail"));
  });

  it("warns on weak rate limits only when compile accepts config", async () => {
    const report = await auditConfiguration({
      config: {
        headers: true,
        bodyLimit: "1mb",
        cors: { origins: ["https://example.com"] },
        rateLimit: { limit: 50, window: 60_000 },
      },
    });

    assert.ok(report.checks.some((check) => check.id === "rate-limit-present"));
  });

  it("warns about MemoryStore in horizontally scaled deployments", async () => {
    const report = await auditConfiguration({
      config: {
        headers: true,
        bodyLimit: "1mb",
        cors: { origins: ["https://example.com"] },
        rateLimit: { limit: 100, window: 60_000 },
      },
      env: {
        KUBERNETES_SERVICE_HOST: "10.0.0.1",
      },
    });

    assert.ok(
      report.checks.some((check) => check.id === "rate-limit-memorystore-scaled"),
    );
  });

  it("fails weak rate limits", async () => {
    const report = await auditConfiguration({
      config: {
        headers: true,
        bodyLimit: "1mb",
        cors: { origins: ["https://example.com"] },
        rateLimit: { limit: 80_000, window: 1_000 },
      },
    });

    assert.equal(report.exitCode, 2);
    assert.ok(report.checks.some((check) => check.id === "rate-limit-weak"));
  });

  it("rejects malformed inline JSON via CLI", async () => {
    const { runAuditCli } = await import("../dist/index.js");
    const code = await runAuditCli(["audit", "--inline", "{not-json"]);
    assert.equal(code, 2);
  });

  it("requires audit subcommand", async () => {
    const { runAuditCli } = await import("../dist/index.js");
    const code = await runAuditCli(["unknown"]);
    assert.equal(code, 2);
  });

  it("warns on CORS wildcard origins", async () => {
    const report = await auditConfiguration({
      config: {
        headers: true,
        bodyLimit: "1mb",
        cors: { origins: "*" },
        rateLimit: { limit: 100, window: 60_000 },
      },
    });

    assert.ok(report.checks.some((check) => check.id === "cors-wildcard-origin"));
  });

  it("never includes secrets in human or JSON output", async () => {
    const secret = "sk_live_super_secret_value";
    const report = await auditConfiguration({
      config: {
        headers: true,
        bodyLimit: "1mb",
        apiKey: {
          validate: async () => ({ id: "k1" }),
        },
      },
    });

    const human = renderHumanReport(report);
    const json = renderJsonReport(report);
    assert.doesNotMatch(human, new RegExp(secret));
    assert.doesNotMatch(json, new RegExp(secret));
  });

  it("parses inline JSON config", async () => {
    const report = await auditConfiguration({
      config: { headers: false },
    });
    assert.ok(report.checks.some((check) => check.id === "headers-disabled"));
  });

  it("detects kubernetes deployment hints", () => {
    const hints = detectDeploymentHints({ KUBERNETES_SERVICE_HOST: "10.0.0.1" });
    assert.equal(hints.kubernetes, true);
    assert.equal(hints.horizontallyScaled, true);
  });

  it("renders JSON report for CI", async () => {
    const report = await auditConfiguration({ config: { headers: true, bodyLimit: 1024 } });
    const json = JSON.parse(renderJsonReport(report));
    assert.equal(typeof json.score, "number");
    assert.ok(Array.isArray(json.checks));
  });
});
