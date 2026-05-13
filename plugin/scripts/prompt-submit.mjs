#!/usr/bin/env node

/**
 * tt-b hook: UserPromptSubmit
 *
 * Captures the user prompt as an observation via the tt-b REST server.
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
  await fetch(`${REST_URL}/memory/observe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hookType: "prompt_submit",
      prompt: data.prompt || data.userMessage || "",
      ...data,
    }),
    signal: AbortSignal.timeout(3000),
  });
} catch {
  // tt-b server not running — non-blocking
}
