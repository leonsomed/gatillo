import "react-router";
import express from "express";
import { createRequestHandler } from "@react-router/express";
import { authMiddleware, authRouter } from "./auth";
import { createDbSnapshot, initDb } from "./db";
import { triggersRouter } from "./triggers";
import { runMonitor } from "./monitor";
import { reportError } from "./errors";

declare module "react-router" {
  interface AppLoadContext {
    VALUE_FROM_EXPRESS: string;
  }
}

const BACKUP_SNAPSHOT_INTERVAL = 1000 * 60 * 60 * 24;
const MONITOR_INTERVAL = 1000 * 60 * 60;

let devIsInitialized = false;

export async function initApp() {
  if (!devIsInitialized) {
    process.on("uncaughtException", async (error) => {
      await reportError(error, { source: "uncaughtException" });
      process.exit(1);
    });
    process.on("unhandledRejection", async (reason) => {
      await reportError(reason, { source: "unhandledRejection" });
      process.exit(1);
    });

    await initDb();
    setInterval(createDbSnapshot, BACKUP_SNAPSHOT_INTERVAL);
    setInterval(runMonitor, MONITOR_INTERVAL);
    runMonitor();
    devIsInitialized = true;
  }

  const app = express();

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  authMiddleware.forEach((fn) => app.use(fn));

  app.use(authRouter);
  app.use(triggersRouter);

  app.use(
    createRequestHandler({
      build: () => import("virtual:react-router/server-build"),
      getLoadContext() {
        return {
          VALUE_FROM_EXPRESS: "Hello from Express",
        };
      },
    }),
  );

  // @ts-expect-error typescript doesnt find this signature https://expressjs.com/en/guide/error-handling.html
  app.use((err, req, res, next) => {
    const isProd = process.env.NODE_ENV === "production";

    reportError(err, {
      source: "expressErrorMiddleware",
      details: {
        method: req.method,
        path: req.path,
      },
    });

    const statusCode =
      ("httpStatusCode" in err ? err.httpStatusCode : 500) ?? 500;

    res.status(statusCode).json({
      message: isProd ? "unknown error" : (err?.message ?? "unknown error"),
    });
  });

  return app;
}
