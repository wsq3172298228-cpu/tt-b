#!/usr/bin/env node

/**
 * tt-b hook: PreCompact
 *
 * Injects memory context before compaction to preserve continuity.
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

try {
  const res = await fetch(`${REST_URL}/memory/observe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hookType: "pre_compact", ...data }),
    signal: AbortSignal.timeout(1500),
  });

  if (res.ok) {
    const result = await res.json();
    if (result.context) {
      process.stdout.write(result.context);
    }
  }
} catch {
  // tt-b server not running — non-blocking
}
