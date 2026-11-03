# Render Server Diagnostics

A standalone browser page for testing a compatible Render Server.

Open `index.html` directly or host this directory as static files. Enter the target server's base URL (for example, `http://localhost:8080`) and run the checks.

The page calls the public API only; it does not use private server endpoints.

## Current checks

- API health/readiness and version information.
- Available styles.

The page is deliberately independent of the Render Server deployment. When hosted on another origin, the target server must allow that origin through its CORS configuration.

## Planned checks

- Upload a test `.sng` file.
- Select a style and configure mix/render options.
- Render and download MIDI.
- Inspect playback metadata.
- Copy/export a diagnostic report.
