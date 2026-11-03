# Render Server HTTP API – v1 draft

**Status:** Proposal for the first implementation. This document is the contract to implement against; details can still be adjusted before the first stable release.

Base path: `/api/v1`

All endpoints return UTF-8 JSON for structured responses. Errors use a consistent JSON body.

## 1. Health and capabilities

`GET /api/v1/health`

Returns whether the service is ready and identifies the software/runtime versions.

Example:

```json
{
  "status": "ok",
  "apiVersion": "1",
  "serverVersion": "0.1.0-SNAPSHOT",
  "engine": {
    "name": "JJazzLab",
    "version": "..."
  },
  "runtime": {
    "javaVersion": "..."
  }
}
```

The endpoint should distinguish a running HTTP service from a ready rendering engine. If the engine cannot render, return HTTP 503 with `status: "not_ready"` and a useful diagnostic message.

## 2. Available styles

`GET /api/v1/styles`

Returns the styles available to the rendering engine.

Example:

```json
{
  "styles": [
    {
      "id": "style-id",
      "name": "Style display name",
      "source": "bundled"
    }
  ]
}
```

Style IDs are the values accepted by the render endpoint. The list must describe what is actually installed on this server; clients must not assume that every server has identical optional style packs.

## 3. Render a song

`POST /api/v1/render`

Content type: `multipart/form-data`

Initial request fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `song` | yes | JJazzLab `.sng` file (XML) |
| `style` | yes | Style ID returned by `GET /styles` |
| `mix` | no | JSON mix configuration |
| `options` | no | JSON rendering options |

The first implementation should validate the uploaded song and selected style before invoking the engine. Rendering must not require a server-side user session.

### Response design

The response format for MIDI plus playback metadata is intentionally still open. The implementation should not lock clients into a large base64-encoded MIDI field in JSON or into server-side session state. Before implementing this endpoint, settle on a transport that lets the client retrieve MIDI bytes and structured metadata together while keeping the server stateless (for example, a multipart response or a documented binary container).

The metadata should be sufficient for a player to show musical position without parsing the `.sng` file. At minimum, evaluate:

- tempo and time signature;
- total bars and playback duration;
- bar/beat positions;
- chord progression and the corresponding MIDI playback positions.

The exact timing representation (ticks, microseconds, or both) must be specified before implementation.

## 4. Error format

Use a predictable JSON error object:

```json
{
  "error": {
    "code": "INVALID_SONG",
    "message": "The uploaded song could not be parsed.",
    "details": {}
  }
}
```

Suggested HTTP status mapping:

- `400` – malformed request or invalid song/options;
- `404` – unknown endpoint or style ID;
- `413` – upload too large;
- `415` – unsupported content type;
- `422` – valid request that cannot be rendered;
- `500` – unexpected server error;
- `503` – rendering engine unavailable/not ready.

Do not expose stack traces or local filesystem paths in public error responses. Detailed diagnostics belong in server logs.

## 5. CORS

The server should support configurable CORS origins so a Player or Diagnostics page hosted on a different origin can call the API. Avoid wildcard origins when credentials are enabled. The API should not require cookies or browser sessions.

## 6. Compatibility

Expose both the API version and the JJazzLab rendering engine version. Clients should be able to display these values and report them when troubleshooting. Rendering behavior may differ between engine versions, so version information is part of the diagnostic contract.
