#!/usr/bin/env node

/**
 * tt-b hook: SubagentStop
 *
 * Records subagent completion via the tt-b REST server.
 * Truncates last message to 4000 chars.
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

const lastMessage = typeof data.lastMessage === "string"
  ? data.lastMessage.slice(0, 4000)
  : "";

fetch(`${REST_URL}/memory/observe`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ hookType: "subagent_stop", lastMessage, ...data }),
  signal: AbortSignal.timeout(800),
}).catch(() => {});
