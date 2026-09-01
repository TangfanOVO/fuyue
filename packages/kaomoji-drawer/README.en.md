# Fuyue Kaomoji Drawer

[简体中文](./README.md) · [English](./README.en.md)

A local-first React kaomoji drawer with an optional MCP server for AI companions and desktop clients. It ships with 325 deduplicated public kaomoji instead of an empty drawer, and supports manual add/remove, multiple categories per record, favourites, manual category ordering, hidden usage-frequency ranking, and Unicode compatibility hints.

The primary entry point is a React component that can be installed in one command. The MCP server is optional: regular users do not need to deploy a backend, while AI clients can search, pick, curate, and learn from local usage through standard tools.

## Ways to use it

| Mode | Best for | Storage | Backend required |
| --- | --- | --- | --- |
| Local drawer | Personal websites, PWAs, small tools | `localStorage` | No |
| Repository adapter | Chat apps and team products | REST / IndexedDB / SQLite | Your choice |
| Local MCP | Clients that support stdio MCP | JSON in the user's home directory | No, only Node.js |

## Install from GitHub

```bash
npm install https://github.com/TangfanOVO/fuyue-kaomoji-drawer/archive/refs/tags/v0.5.1.tar.gz
```

Pin a release when you need reproducible installs:

```bash
npm install https://github.com/TangfanOVO/fuyue-kaomoji-drawer/archive/refs/tags/v0.5.1.tar.gz
```

## React integration

```tsx
import { KaomojiDrawer, createLocalKaomojiRepository } from "@fuyue/kaomoji-drawer";
import "@fuyue/kaomoji-drawer/styles.css";

const repository = createLocalKaomojiRepository();

<KaomojiDrawer
  repository={repository}
  onInsert={(value) => setDraft((draft) => `${draft} ${value}`.trim())}
/>
```

The drawer never exposes `useCount` in the UI. Every selection increments it locally so frequently used entries naturally move toward the top.

## Plain HTML / static-site integration

No React project, npm, or bundler is required. Add an input and a mount target, then load the self-contained release bundle:

```html
<textarea id="message"></textarea>
<div id="kaomoji-drawer"></div>
<script src="https://cdn.jsdelivr.net/gh/TangfanOVO/fuyue-kaomoji-drawer@v0.5.1/dist/standalone.js"></script>
<script>FuyueKaomoji.mount("#kaomoji-drawer", { input: "#message" });</script>
```

The bundle includes React, the drawer, and its styles; callers no longer need to assemble CDN dependencies or an import map. Selecting a face inserts it at the current caret and emits a standard `input` event. See [`examples/standalone.html`](./examples/standalone.html) for a complete runnable page. Non-input hosts can pass `onInsert(value)` or listen for `fuyue-kaomoji-insert` on the mount target.

## Curated library subscription

The package only needs to be installed once. Under **Manage → Curated library**, people can choose:

- **Automatic**: check at most once per day when the drawer opens;
- **Manual only** (default): connect only after pressing **Sync now**;
- **Off**: never check the remote catalog.

Sync only appends newly reviewed public entries. It preserves favourites, use counts, manual categories, category order, and local deletions. Personal data stays in the caller's own `KaomojiRepository`; the remote feed contains versioned public content only.

Use a private mirror or a different curated feed by replacing the manifest URL:

```tsx
<KaomojiDrawer
  repository={repository}
  catalog={{ manifestUrl: "https://example.com/kaomoji/manifest.json" }}
  onInsert={insert}
/>
```

Pass `catalog={false}` to remove the sync controls entirely. The public contract is documented by [`catalog/manifest.json`](./catalog/manifest.json).

For fully custom classification or imports, use [`catalog/kaomoji-values.json`](./catalog/kaomoji-values.json). It contains only the original kaomoji strings, without this project's categories, labels, or compatibility judgement. A JSON array is used instead of one-value-per-line text so multiline ASCII art remains one intact item.

## Optional MCP for AI clients

The MCP server does not simulate clicks. An AI calls `kaomoji_pick`, receives the selected kaomoji, and includes it in its own response. The local usage count is updated at the same time.

Install the pinned release globally:

```bash
npm install -g https://github.com/TangfanOVO/fuyue-kaomoji-drawer/archive/refs/tags/v0.5.1.tar.gz
```

Then add the command to a client that supports local stdio MCP:

```json
{
  "mcpServers": {
    "kaomoji": {
      "command": "fuyue-kaomoji-mcp"
    }
  }
}
```

Or let the client fetch the GitHub release with `npx`:

```json
{
  "mcpServers": {
    "kaomoji": {
      "command": "npx",
      "args": ["-y", "https://github.com/TangfanOVO/fuyue-kaomoji-drawer/archive/refs/tags/v0.5.1.tar.gz"]
    }
  }
}
```

The default data file is `~/.fuyue-kaomoji/kaomoji.json`. The bundled 325-entry library is available on first run, and existing six-item starter files are filled out automatically after upgrading. Set `FUYUE_KAOMOJI_PATH` to use another path.

Available tools:

- `kaomoji_search`: search by mood, label, category, or literal fragment;
- `kaomoji_pick`: rotate among strong matches, avoid immediate repetition, and increment the hidden use count;
- `kaomoji_add` / `kaomoji_remove`: add one or up to 200 classified items at once, or remove an exact value;
- `kaomoji_favorite`: favourite or unfavourite an entry;
- `kaomoji_inspect`: inspect compatibility risks without saving.

Whether a particular desktop or mobile app can use the MCP entry depends on whether it supports local stdio MCP and custom commands. The React drawer remains usable without MCP.

Legacy English category labels such as `shy`, `studying`, `sad`, `angry`, and `happy` are migrated into the Chinese taxonomy on read. Category tabs use hidden local usage, favourites, and a practical fallback order by default. They can also be reordered by drag or arrow controls under **Manage**. Once saved, manual order wins; unseen categories are appended using the automatic order.

### Sharing usage between the drawer and MCP

Browser `localStorage` and the MCP JSON file are not automatically connected. To let the human drawer and AI learn from the same usage history, point both repository adapters at one shared bridge:

```text
React drawer ── KaomojiRepository ── shared REST/SQLite/JSON bridge
                                      └── MCP tools
```

No public sync account is required or bundled. The curated feed contains public content only; private favourites, frequency, and shared state remain inside the host application.

## Custom data source

Implement `KaomojiRepository` to connect REST, IndexedDB, SQLite, or another local service:

```ts
import type { KaomojiRepository } from "@fuyue/kaomoji-drawer";

const repository: KaomojiRepository = {
  list: () => fetch("/api/kaomoji").then((response) => response.json()).then((data) => [...data.items]),
  upsert: (value, categories, label) => request("/api/kaomoji", { method: "POST", body: { value, categories, label } }),
  remove: (value) => request(`/api/kaomoji/${encodeURIComponent(value)}`, { method: "DELETE" }),
  markUsed: (value) => request("/api/kaomoji/use", { method: "POST", body: { value } }),
  setFavorite: (value, favorite) => request("/api/kaomoji/favorite", { method: "POST", body: { value, favorite } }),
};
```

`list()` should return a fresh array on every call so React can reliably refresh favourites, usage order, and removals. The bundled `localStorage` and JSON repositories already follow this contract.

If your backend also maintains a fetched review queue, implement the optional `KaomojiReviewRepository` and pass it as `reviewRepository`. The drawer then exposes reject, keep-original, and keep-compatible actions. One kaomoji can belong to multiple categories separated by English or Chinese commas, ideographic commas, or slashes.

Remote collection and automatic review belong in your own repository/backend adapter. Preserve sources and licences; auto-approve entries only when both provenance and cross-device rendering are reliable, and send uncertain glyphs or categories to a review queue.

## Unicode compatibility

Entries explicitly categorized as `ASCII Art`, `ascii_art`, or `字符画` preserve authored line breaks and indentation. Those layout characters are not reported as corruption; genuine damaged characters and font-coverage risks are still surfaced.

When a kaomoji renders correctly on one device but appears as bars or missing-glyph boxes on another, the cause is often font coverage or combining-mark behaviour rather than broken UTF-8. This package:

- removes transport-only direction controls;
- preserves the original kaomoji;
- flags stacked marks and uncommon glyph ranges;
- can offer a less decorative but more portable fallback.

Compatibility analysis is a risk indicator, not a guarantee for every font and operating system.

## Development

```bash
npm install
npm test
```

Requires Node.js 20 or newer. The MCP server uses the official TypeScript SDK v2 stdio transport and keeps protocol output on stdout.

## Acknowledgements

The interaction design and part of the starter data are derived from [Pyruslili/KaomojiDrawerKit](https://github.com/Pyruslili/KaomojiDrawerKit) under the MIT License; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). The React/TypeScript component is an independent implementation.

Licence: [MIT](./LICENSE). Personal and commercial use, modification, distribution, and sublicensing are permitted; retain the copyright and licence notice.
