# Render Server

Java-based HTTP service that converts JJazzLab `.sng` song files into MIDI using JJazzLab Core.

## Responsibilities

- Load and initialize the JJazzLab rendering engine.
- Report service readiness and engine/runtime versions.
- List styles actually available in this installation.
- Accept a song, style, mix and render options.
- Return MIDI and playback metadata through a documented, stateless API.
- Provide useful, safe error responses and server-side diagnostic logging.

## Design constraints

- Keep JJazzLab Core isolated in this module. The browser Player must not depend on it.
- Preserve the `.sng` XML as the interchange format; do not introduce a separate full browser-side Song model as an API requirement.
- Do not require a server-side session for rendering.
- Make optional style packs discoverable instead of assuming every installation has the same styles.
- Expose API and engine versions.

## API

See [API v1 draft](../docs/api-v1.md).

Implementation technology and packaging will be selected after checking the existing JJazzLab Core integration and deployment requirements.
