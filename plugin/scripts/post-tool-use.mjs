#!/usr/bin/env node

/**
 * tt-b hook: PostToolUse
 *
 * Captures tool output as an observation via the tt-b REST server.
 * Truncates output to 8000 chars to avoid excessive payloads.
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

const output = typeof data.tool_output === "string"
  ? data.tool_output.slice(0, 8000)
  : JSON.stringify(data.tool_output || "").slice(0, 8000);

try {
  await fetch(`${REST_URL}/memory/observe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hookType: "post_tool_use",
      tool: data.tool_name,
      output,
      ...data,
    }),
    signal: AbortSignal.timeout(3000),
  });
} catch {
  // tt-b server not running — non-blocking
}
