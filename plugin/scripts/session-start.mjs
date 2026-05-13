#!/usr/bin/env node

/**
 * tt-b hook: SessionStart
 *
 * Registers session start with the tt-b REST server.
 * Optionally injects memory context if TTB_INJECT_CONTEXT=true.
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
const INJECT = process.env["TTB_INJECT_CONTEXT"] === "true";

try {
  const res = await fetch(`${REST_URL}/memory/observe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hookType: "session_start", ...data }),
    signal: AbortSignal.timeout(800),
  });

  if (INJECT && res.ok) {
    const result = await res.json();
    if (result.context) {
      process.stdout.write(result.context);
    }
  }
} catch {
  // tt-b server not running — non-blocking
}
