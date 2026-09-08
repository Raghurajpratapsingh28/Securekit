import express from "express";
import { securekit } from "@securekit/core";
import { expressAdapter } from "@securekit/express";

const app = express();
const kit = securekit({
  headers: true,
  cors: { origins: ["https://app.example.com"] },
  bodyLimit: "1mb",
  rateLimit: { limit: 100, window: 60_000 },
});

app.use(expressAdapter(kit));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(3000, () => {
  console.log("listening on :3000");
});
