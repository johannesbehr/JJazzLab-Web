# Render Server HTTP API – v1

**Status:** Initial implementation contract.

Base path: `/api/v1`

The API is stateless and does not require cookies or server-side user sessions. Song input is JJazzLab-compatible `.sng` XML.

## 1. Health

`GET /api/v1/health`

Returns service readiness and version information.

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

A running HTTP service is not necessarily a ready rendering service. If the rendering engine is unavailable or failed to initialize, return HTTP `503` and `status: "not_ready"` with a diagnostic message.

## 2. Render a song

`POST /api/v1/render`

Request content type: `multipart/form-data`

| Field | Required | Meaning |
| --- | --- | --- |
| `song` | yes | JJazzLab `.sng` file containing XML |
| `mix` | no | JSON mix configuration |
| `options` | no | JSON rendering options |

Style selection is intentionally out of scope for the initial implementation. It will be addressed when the Editor is implemented.

Rendering must not require a server-side user session.

### 2.1 Successful response

HTTP status: `200 OK`

Content type: `multipart/mixed`

The response contains two parts:

1. JSON metadata (`Content-Type: application/json; charset=utf-8`, `Content-ID: <metadata>`)
2. MIDI data (`Content-Type: audio/midi`, `Content-ID: <midi>`)

The parts are identified by their Content-ID, not by their position in the response.

Example JSON metadata part:

```json
{
  "success": true,
  "engineVersion": "1.0.0",
  "metadata": {
    "ticksPerQuarterNote": 960,
    "totalBars": 32,
    "tempoMap": [
      { "tick": 0, "bpm": 120 }
    ],
    "timeSignatureMap": [
      { "tick": 0, "numerator": 4, "denominator": 4 }
    ],
    "positions": [
      { "tick": 0, "bar": 1, "beat": 1, "chord": "Am7" },
      { "tick": 3840, "bar": 2, "beat": 1, "chord": "Dm7" }
    ]
  }
}
```

The MIDI part contains the generated Standard MIDI File bytes. MIDI data must be transferred as binary data, never Base64-encoded inside JSON.

### 2.2 Timing and playback metadata

All `tick` values are absolute MIDI ticks measured from the beginning of the returned MIDI file. `ticksPerQuarterNote` defines the tick resolution.

- `tempoMap` describes tempo changes, with each event positioned by absolute tick.
- `timeSignatureMap` describes time-signature changes, also positioned by absolute tick.
- `positions` maps musical events (especially chord changes) to absolute MIDI ticks.
- `bar` and `beat` are one-based display positions on the playback timeline.

The metadata and MIDI file must share exactly the same timeline and origin. The Player can determine the active chord by finding the last position event whose tick is less than or equal to the current MIDI playback tick.

## 3. Errors

If a request cannot be rendered, the server returns a JSON response only. There is no MIDI part.

Content type: `application/json; charset=utf-8`

Example:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_SONG",
    "message": "The supplied song could not be rendered.",
    "details": [
      {
        "code": "INVALID_CHORD",
        "message": "Invalid chord: Hm7",
        "position": {
          "bar": 4,
          "beat": 2
        }
      }
    ]
  }
}
```

`details` is an array and may be empty. Individual detail objects may include additional structured context, such as a musical position. Public error messages must not expose stack traces, local filesystem paths, or other sensitive server details. Full diagnostics belong in server logs.

### 3.1 HTTP status codes

| Status | Meaning |
| --- | --- |
| `200` | Rendering successful |
| `400` | Malformed request or missing required field |
| `413` | Request payload too large |
| `415` | Unsupported request content type or file format |
| `422` | Song is readable but cannot be rendered |
| `500` | Unexpected internal server error |
| `503` | Rendering engine unavailable or not ready |

Errors produced by the API should use the JSON error structure above, including when an HTTP error status is returned. Reverse proxies and servlet containers should be configured so that they do not replace API errors with generic HTML error pages.

## 4. CORS

The server should support configurable CORS origins so a Player or Diagnostics page hosted on a different origin can call the API. Avoid wildcard origins when credentials are enabled. The API does not require cookies or browser sessions.

## 5. Compatibility

Expose both the API version and JJazzLab rendering engine version. Clients should be able to display these values and include them in diagnostic reports. Rendering behavior may differ between engine versions, so engine version information is part of the diagnostic contract.
