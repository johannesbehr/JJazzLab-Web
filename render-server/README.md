# Render Server

Java-based HTTP service that converts JJazzLab `.sng` song files into MIDI using JJazzLab Core.

## Responsibilities

- Load and initialize the JJazzLab rendering engine.
- Report service readiness and engine/runtime versions.
- Accept a song, optional mix configuration and optional render options.
- Return MIDI and playback metadata in a stateless multipart response.
- Return structured JSON errors without a MIDI part when rendering fails.
- Provide useful, safe error responses and server-side diagnostic logging.

## Initial scope

The first implementation includes:

- `GET /api/v1/health`
- `POST /api/v1/render`

Style discovery and style selection are intentionally postponed until the Editor phase.

## Design constraints

- Keep JJazzLab Core isolated in this module. The browser Player must not depend on it.
- Preserve the `.sng` XML as the interchange format; do not introduce a separate full browser-side Song model as an API requirement.
- Do not require a server-side session for rendering.
- Keep MIDI and playback metadata on the same absolute MIDI-tick timeline.
- Expose API and engine versions.

## API

See [API v1](../docs/api-v1.md).
