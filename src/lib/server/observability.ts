type LogLevel = "info" | "warn" | "error";

type EventPayload = Record<string, unknown> & {
  event: string;
  scope: string;
};

function writeLog(level: LogLevel, payload: EventPayload) {
  const entry = {
    level,
    ts: new Date().toISOString(),
    ...payload
  };

  const message = JSON.stringify(entry);
  if (level === "error") {
    console.error(message);
    return;
  }

  if (level === "warn") {
    console.warn(message);
    return;
  }

  console.info(message);
}

export function logServerEvent(payload: EventPayload) {
  writeLog("info", payload);
}

export function logServerWarning(payload: EventPayload) {
  writeLog("warn", payload);
}

export function logServerError(
  scope: string,
  event: string,
  error: unknown,
  context: Record<string, unknown> = {}
) {
  const err =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      : {
          message: String(error)
        };

  writeLog("error", {
    event,
    scope,
    ...context,
    error: err
  });
}
