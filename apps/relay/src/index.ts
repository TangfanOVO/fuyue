import { loadConfig } from "./config.js";
import { createRelayServer } from "./server.js";

const config = loadConfig();
const relay = createRelayServer(config);
const address = await relay.listen();
console.log(`Fuyue relay listening on http://${address.address}:${address.port}`);
console.log(`Configured providers: ${config.providers.map((item) => item.label).join(", ") || "none"}`);
