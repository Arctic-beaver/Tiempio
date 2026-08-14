# Web persistence boundary

Browser file handles, selected `File` snapshots, object URLs and IndexedDB records remain private to
this adapter. Shared application contracts receive only unpredictable opaque handles, owned bounded
bytes, current settings and truthful persistence outcomes.

- Physical `.tiempio` ZIP validation is owned by `packages/project-format`; `fflate` is loaded only
  when an archive must be opened or encoded.
- `persist` never prompts. It writes only through an existing handle whose current `readwrite`
  permission is already `granted`, rechecks the last fingerprint and verifies exact bytes after the
  browser closes the writer.
- `persistAs` may open the save picker from its caller's user action. If that API is absent, it
  requests a Download and does not bind or acknowledge a saved revision.
- `saveCopy` always reports `download-requested`; browser Download completion is unknowable.
- IndexedDB database `tiempio-runtime` uses one current shape with separate `settings` and `recoveries` stores.
  Corrupt, excessive, blocked, aborted and quota-limited storage fails closed without disabling the
  in-memory project registry.

Direct browser writes are serialized and verified, but they are not claimed to be atomic filesystem
replacement. Browser handles and original file names are not retained across reloads.
