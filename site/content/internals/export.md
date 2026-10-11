---
title: The export pipeline
nav: Export
---

Exporting turns a document, or a deck, into one `.html` file that opens from disk with no server and no network. This page describes how that file is made: the offline build of the app, the payload of documents, records and pictures, the fonts that travel with it, the stand-in that answers the app's requests from memory, and how the docs' own live examples reuse the same stand-in.

It describes [export.ts](src:src/server/export.ts), [offline.ts](src:src/core/offline.ts), the files in `src/web/offline/` ([main.tsx](src:src/web/offline/main.tsx) and [standin.ts](src:src/web/offline/standin.ts)) and [vite.offline.config.ts](src:vite.offline.config.ts). For what a person gets, see [Export](/library/export/).

## The pipeline

[GET /api/docs/:id/export](<route:GET /api/docs/:id/export>) and [GET /api/decks/:id/export](<route:GET /api/decks/:id/export>) are for the owner (`need({ doc: 'owner' })` and `need({ deck: 'owner' })`). Both end in `sendExport` in [app.ts](src:src/server/app.ts):

1. **Get the offline build.** `opts.offline()` gives the bundle: a script, a stylesheet and the font files the stylesheet names. If there is none, the answer is `503 the offline build is missing; run npm run build`.
2. **Gather the payload** (`exportOf`): the documents as they are now, the records they read, the fetch cells' last answers, and for a deck its list of slides.
3. **Make the pictures inline and take the addresses out** (`forExport`).
4. **Compose the file** (`composeHtml`): fonts chosen for the text, a content security policy, the payload as JSON and the script.
5. **Send it** as `text/html` with `content-disposition: attachment` and a file name made from the title (`fileName`), and the number of pictures that could not be included in `x-edgy-missing-pictures`.

A deck's file contains its documents except the archived ones, in the deck's order.

## The offline build

The app inside the file is not the app a browser loads from the server. It is a second Vite build with its own entry point:

```ts
rollupOptions: {
  input: 'src/web/offline/main.tsx',
  output: {
    format: 'es',
    inlineDynamicImports: true,
    entryFileNames: 'offline.js',
    assetFileNames: (a) => (a.names?.[0]?.endsWith('.css') ? 'offline.css' : 'fonts/[name]-[hash][extname]'),
  },
},
```

`inlineDynamicImports` and `modulePreload: false` make it one script that loads nothing later. `cssCodeSplit: false` makes the CSS one file. `assetsInlineLimit: 0` keeps fonts as files, so that an export can inline only those a document uses. The result is `offline.js`, `offline.css` and a `fonts/` folder.

Where it comes from depends on how the server runs. After `npm run build`, it is `dist/offline` (`vite build -c vite.offline.config.ts`), read once. In development, `bundleLoader(dir, true)` runs the Vite build itself the first time anyone exports, into a temporary folder, and caches the result for the run, so the first export takes a while.

## The payload

```ts
export interface ExportPayload {
  kind: 'doc' | 'deck';
  exportedAt: number;
  docs: Doc[];
  /** Each document's card, for a deck's list of slides. */
  shapes: Record<string, Shape>;
  deck?: { id: string; title: string; description: string; docs: string[] };
  /** Every collection the documents read or write, by name. */
  records: Record<string, ({ id: string; at: number } & Record<string, Json>)[]>;
  /** Fetch cells' last answers, by document and cell id. */
  fetched: Record<string, Record<string, FetchState>>;
}
```

It is the only thing an export holds besides the app, and it is exactly what the app would have fetched from the server for these documents. `exportOf` fills it so:

- **docs.** Each document goes through `forExport`, below.
- **records.** For every collection the document reads (`reads(doc.id)`: what its formulas and handlers name), the owner's rows as they are now. Nothing else of the owner's.
- **fetched.** The runner's last answer for each fetch cell, with the address left out (`quietState`).
- **shapes.** The small map of each document (`shapeOf`), which a deck's list of slides draws.

Values are worked out with the owner's full view (`world(doc.id, true)`), because it is the owner exporting.

### What leaves the owner's hands

An export is a copy that can be mailed anywhere, so it is scrubbed:

- **Fetch cells lose their address and headers** (`withoutAddresses`), because an address can hold a key. They are never fetched offline, and the answer they last got is kept.
- **Pictures are inlined** as `data:` addresses. `pictures(src)` accepts a `data:image/…` as it is, reads an upload (`/assets/<20 hex>.<ext>`) from the assets folder, and fetches an `http` or `https` picture with the same guarded getter fetch cells use (10 seconds, 8 MB, no private addresses). The type is taken from the first bytes of the file (`sniffImage`), not from its name or its headers. A picture that can't be had becomes empty and is counted in `x-edgy-missing-pictures`.

## Fonts

Fonts are the biggest part of a file, so only the ones the text needs go in. `composeHtml` does this with the stylesheet:

1. `familiesOf(docs)` collects the font families named in the documents' `meta.font`, `meta.headFont` and cells' `style.font`, and always the app's own face.
2. `fontsFor(css, families, text, italic, file)` goes through every `@font-face` rule and keeps only those that matter: of a needed family, in italic only if something is italic (`ITALIC` looks for `"italic":true` and Markdown emphasis in the text), and whose `unicode-range` contains at least one code point the text uses (`rangeHits`, always counting printable ASCII).
3. Each kept face's file is read from the bundle and put in the CSS as a `data:font/woff2;base64,…` URL. A face whose file can't be read is dropped. Every other `url(…)` in the stylesheet becomes `none`, so the file can't ask for anything.

## The file

`composeHtml(payload, bundle, title)` writes a document with four parts: a Content-Security-Policy, the styles, the payload and the script.

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
…
<script type="application/json" id="edgy-export">{…the payload…}</script>
<script type="module">…offline.js…</script>
```

`connect-src 'none'` is what makes "no network" a promise rather than a habit: the browser itself refuses any request the page might try. The payload is escaped (`<` is written as its JSON escape, U+003C) so no text in a document can close its own tag, and a `</script` inside the bundle has its slash escaped. The id is `PAYLOAD_ID` in [offline.ts](src:src/core/offline.ts), shared by the writer and the reader.

## Inside the file

[main.tsx](src:src/web/offline/main.tsx) is the entry. It reads the payload from the page, hands it to a stand-in, and renders:

```ts
const payload = JSON.parse(document.getElementById(PAYLOAD_ID)!.textContent!) as ExportPayload;
setTransport(new StandIn(payload).transport());
```

A document shows in Live with a bar saying **Offline copy**, the date it was exported and that changes stay in the page. A deck shows its slides and a **Play** button. Both use the app's own components, the real `Session` with `mode: 'live'` and `embedded: true`, not a rewrite.

### The stand-in

The app reaches a server through one seam, `web/lib/transport.ts`:

```ts
export interface Transport {
  fetch(url: string, init?: RequestInit): Promise<Response>;
  /** An event stream: the browser's EventSource, or something that behaves like one. */
  stream(url: string): EventSource;
}
```

`setTransport` swaps it. In a normal page `send()` is `window.fetch` and `listen()` is an `EventSource`. In an exported file they are the `StandIn`, which answers the same questions from memory:

| The app asks | The stand-in answers |
| --- | --- |
| `GET /api/docs/:id` | The document it holds. |
| `POST /api/docs/:id/ops` | Applies the ops with `applyOps`, raises the version, tells the open streams, answers with the version, ops and touched cells. A refused op is a 422 like the server's. |
| `GET /api/docs/:id/log`, `/messages` | `[]`. |
| `GET /api/docs/:id/fetched`, `/fetch/:cell` | The exported answers. |
| `POST /api/docs/:id/viewer` | `{ live: true }`. |
| `GET`, `POST`, `PATCH`, `DELETE /api/data/:name…` | Its copy of the records. A save adds a row with a made-up id; each write raises a `data` event. |
| `GET /api/decks/:id`, `/api/library/:id`, `/api/health` | The deck, or a card for the document, or `{ offline: true }`. |
| Anything else | `404 not in this offline copy`. |

The stream is a small class that behaves enough like an `EventSource` for the session: it sends `hello` with the version when it opens, then the `ops` and `data` events the stand-in raises, and a `ping` every ten seconds. So the session's whole machinery (optimistic ops, the pending queue, rebasing on the stream, undo) runs unchanged; it talks to something in the same page. See [The browser session](/internals/session/).

What is missing is what needs a server. There is no runner, so timers don't tick and fetch cells show the answer they had when exported. There is no storage, so records saved in the file, and every change to a document, last until the page is closed. There are no accounts and no sync. The bar says that changes stay in the page.

## The docs reuse it

The live examples on these pages are the same thing. `site/client/live.tsx` is an iframe's script. When the page sends it a document, it builds it with `applyOps` on a new `Doc`, makes the same `StandIn` the exported files use with that one document and the example's sample records, and renders the same `Session` and `LiveSheet`:

```ts
setTransport(new StandIn({ kind: 'doc', exportedAt: Date.now(), docs: [doc], shapes: {}, records, fetched: {} }).transport());
```

That is why a `live` example can be pressed and typed in, why records it saves vanish with the page, and why timers and fetch cells need a `notation` block and a picture instead. It is [live.tsx](src:site/client/live.tsx), and the example is an exported file without the export.
