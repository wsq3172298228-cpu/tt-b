#!/usr/bin/env node

/**
 * tt-b hook: SubagentStart
 *
 * Records subagent start event via the tt-b REST server.
 */

let input = "";
for await (const chunk of process.stdin) input += chunk;

function isSdkChildContext(payload) {
  if (process.env["TTB_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return payload.entrypoint === "sdk-ts";
}

const data = JSON.parse(input);
if (isSdkChildContext(data)) process.exit(0);

const REST_URL = process.env["TTB_REST_URL"] || "http://localhost:3742";

fetch(`${REST_URL}/memory/observe`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ hookType: "subagent_start", ...data }),
  signal: AbortSignal.timeout(800),
}).catch(() => {});
