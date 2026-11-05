# JJazzLab Web

A modular, open-source web application and rendering service built around JJazzLab.

The project is organized into independent parts:

- **Render Server** – renders JJazzLab song files (`.sng`) to MIDI.
- **Player** – a lightweight browser MIDI player. It does not depend on JJazzLab Core.
- **Editor** – a browser-based song editor built on top of the Player.
- **Diagnostics** – a standalone web page for checking and testing any compatible Render Server.

## Project status

Early development. The API and module boundaries are being established; interfaces may change until the first stable release.

The first testpages are online:

- [Render Server test page: diagnostics/index.html](https://johannesbehr.github.io/JJazzLab-Web/diagnostics/player-test.html)
- [Player test page: diagnostics/player-test.html](https://johannesbehr.github.io/JJazzLab-Web/diagnostics/player-test.html)

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

1. Implement the versioned HTTP API and health endpoint.
2. Accept a supplied `.sng` file and render it to MIDI.
3. Return MIDI and playback metadata in a multipart response.
4. Return structured JSON errors when rendering fails.
5. Verify the complete flow through the Diagnostics page.

Style discovery and style selection are deliberately postponed until the Editor phase.

See [API v1](docs/api-v1.md) and [Diagnostics](diagnostics/README.md).

## License

To be defined.
