#!/usr/bin/env node
import { runAuditCli } from "./index.js";

const exitCode = await runAuditCli(process.argv.slice(2));
process.exitCode = exitCode;
