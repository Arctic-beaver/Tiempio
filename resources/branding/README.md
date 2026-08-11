# Tiempio application icon

`tiempio.svg` is the canonical source. Its mark uses the exact paths from the
application title bar and the light Tiempio surface/accent tokens.

The platform files are rasterized from that source rather than redrawn:

- `tiempio.ico` contains 16, 24, 32, 48, 64, 128 and 256 pixel Windows frames;
- `tiempio.icns` contains modern PNG-backed macOS frames through 1024 pixels;
- `linux/<size>x<size>.png` provides the named Linux icon set;
- `tiempio-512.png` is the Electron development-window and macOS Dock icon.

When the title-bar mark changes, update the SVG first and regenerate every
derived file in the same change. The PNG and ICO frames are rendered with
ImageMagick; `node scripts/assemble-brand-icns.mjs` then assembles the checked
PNG frames into the macOS container without recompressing them.
