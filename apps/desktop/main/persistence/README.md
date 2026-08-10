# Native persistence boundary

This directory is owned by Electron main. It contains the Stage 5 physical `.tiempio` ZIP adapter,
canonical source registry, native dialog adapter, fingerprint-guarded atomic writer, recovery store
and settings store.

Renderer-facing code receives only opaque handles, bounded manifest snapshots, revision-bound
outcomes and redacted application errors. Native paths, physical archives and application-data
locations do not cross the preload boundary. UI composition and styling are intentionally outside
this module.
