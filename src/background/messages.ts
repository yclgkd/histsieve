import type { CleanupResult } from "./cleaner";

export type CleanNowResponse =
  | ({ ok: true } & CleanupResult)
  | { ok: false; error: "cleanup_failed" };

export type MessageDeps = {
  executeCleanup: () => Promise<CleanupResult>;
};

export type SendResponse = (response: CleanNowResponse) => void;

type CleanNowRequest = {
  type: "histsieve.cleanNow";
};

function isCleanNowRequest(value: unknown): value is CleanNowRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as { type: unknown }).type === "histsieve.cleanNow"
  );
}

export function handleRuntimeMessage(
  message: unknown,
  deps: MessageDeps,
  sendResponse: SendResponse,
): boolean {
  if (!isCleanNowRequest(message)) return false;

  void deps
    .executeCleanup()
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => {
      console.warn("[histsieve] cleanNow failed", err);
      sendResponse({ ok: false, error: "cleanup_failed" });
    });

  return true;
}
