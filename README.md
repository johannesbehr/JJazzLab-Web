# JJazzLab Web

A modular, open-source web application and rendering service built around JJazzLab.

The project is organized into independent parts:

- **Render Server** – renders JJazzLab song files (`.sng`) to MIDI.
- **Player** – a lightweight browser MIDI player. It does not depend on JJazzLab Core.
- **Editor** – a browser-based song editor built on top of the Player.
- **Diagnostics** – a standalone web page for checking and testing any compatible Render Server.

## Project status

Early development. The API and module boundaries are being established; interfaces may change until the first stable release.

## Architecture

The Render Server is the only module that needs JJazzLab Core. The Player and Editor communicate with it through a documented HTTP API. Song data is exchanged as JJazzLab-compatible `.sng` XML; the browser may inspect and edit the XML but does not need to maintain a complete internal JJazzLab song model.

The Diagnostics page uses the public HTTP API only. It is intended to work against a locally hosted server or a remote server supplied by the user.

## Modules

| Directory | Responsibility |
| --- | --- |
| `render-server/` | Java service, rendering engine integration and HTTP API |
| `player/` | Browser MIDI playback |
| `editor/` | Song editing UI |
| `diagnostics/` | Standalone Render Server test page |
| `docs/` | Architecture and API documentation |
| `examples/` | Test songs and example configuration |

## First implementation milestone

1. Define and implement the versioned API.
2. Expose server health and engine/version information.
3. Expose the available styles.
4. Render a supplied `.sng` file to MIDI.
5. Verify the complete flow through the Diagnostics page.

See [API v1 draft](docs/api-v1.md) and [Diagnostics](diagnostics/README.md).

## License

To be defined.
