# @streamerjs/streamerjs

## 1.3.1

### Patch Changes

- [#30](https://github.com/sergeychernyshev/streamerjs/pull/30) [`85d5f9a`](https://github.com/sergeychernyshev/streamerjs/commit/85d5f9a3b4bd20c27eaa5c5d1eb4b8bbeb002454) - Stop publishing development tooling to npm, the package no longer carries the changesets config, GitHub workflows, Prettier config and release documentation

## 1.3.0

### Minor Changes

- [#26](https://github.com/sergeychernyshev/streamerjs/pull/26) [`1bb4e77`](https://github.com/sergeychernyshev/streamerjs/commit/1bb4e77f350f2ca53f5c4c5525f0691ab8118120) - Remove the `create-scene` and `create-control-panel` commands, which the `create-streamerjs` package now provides as `npm create streamerjs scene` and `npm create streamerjs control-panel`

### Patch Changes

- [#28](https://github.com/sergeychernyshev/streamerjs/pull/28) [`7d96f3e`](https://github.com/sergeychernyshev/streamerjs/commit/7d96f3ec6006abbb9f2609efe53de07d04f2019d) - Show only the root URL on startup, as a plain list instead of a table, the page it opens already links to the scenes and the control panel

## 1.2.1

### Patch Changes

- [#20](https://github.com/sergeychernyshev/streamerjs/pull/20) [`39c22dc`](https://github.com/sergeychernyshev/streamerjs/commit/39c22dcf9ce1cb9a9f7833150a96c8d7a997d3b3) - Fix the control panel and server scripts crashing on start on Linux, where the PouchDB client library path was resolved with the wrong capitalization
