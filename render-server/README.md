# Render Server

Java-based HTTP service that converts JJazzLab `.sng` song files into MIDI using the headless JJazzLab Toolkit.

## Responsibilities

- Initialize the JJazzLab Toolkit and its rhythm database.
- Report service readiness and engine/runtime versions.
- Accept a JJazzLab `.sng` file.
- Return MIDI and playback metadata in a stateless multipart response.
- Return structured JSON errors without a MIDI part when rendering fails.
- Keep detailed diagnostics in server logs.

## Initial scope

The first implementation includes:

- `GET /api/v1/health`
- `POST /api/v1/render`

The initial render request contains the `song` file only. Mix configuration, render options and style selection are postponed until their requirements are defined. Style discovery and selection will be addressed when the Editor is implemented.

## Technology

- Java 25
- Apache Tomcat 11 (Jakarta Servlet 6.1)
- Maven WAR
- JJazzLab Toolkit 5.2.1

## Design constraints

- Keep JJazzLab Core isolated in this module. The browser Player must not depend on it.
- Preserve the `.sng` XML as the interchange format; do not introduce a separate full browser-side Song model as an API requirement.
- Do not require a server-side user session for rendering.
- Use a request-scoped playback session for each render.
- Keep MIDI and playback metadata on the same absolute MIDI-tick timeline.
- Expose API and engine versions.

## Build

From this directory, build the WAR with:

```sh
mvn clean package
```

Deploy `target/jjazzlab-render-server.war` to a Java 25 / Tomcat 11 instance.

Configure browser access with the `JJAZZLAB_CORS_ORIGINS` environment variable, using a comma-separated list of allowed origins, for example:

```sh
JJAZZLAB_CORS_ORIGINS=https://player.example.org,https://diagnostics.example.org
```

The filter does not enable credentials. Use `*` only when the API is intentionally public to browser clients from any origin.

## API

See [API v1](../docs/api-v1.md).
