#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { buildKaomojiMcpServer } from "./mcp-server.js";

await serveStdio(() => buildKaomojiMcpServer());
