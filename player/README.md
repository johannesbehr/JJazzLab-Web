# JJazzLab Web Player

A small embeddable browser player implemented as the `<jjazzlab-player>` custom element. It has no JJazzLab Core dependency and communicates with the Render Server through HTTP API v1.

## Embed

After the GitHub Pages build has been published:

```html
<script type="module" src="https://<github-pages-host>/<repository>/player/jjazzlab-player.js"></script>

<jjazzlab-player
  song-url="https://example.org/songs/OyeComoVa.sng"
  render-server="https://wmager.ddns.net/java/jjazzlab-render-server"
  soundfont-url="https://<github-pages-host>/<repository>/player/soundfonts/JJazzlab.sf3">
</jjazzlab-player>
```

All three attributes are required. The Render Server URL is the application base URL; the player appends `/api/v1/render`.

## Build

Requirements: Node.js 20 or newer.

```sh
cd player
npm install
npm run build
```

The build creates the deployable bundle and matching SpessaSynth AudioWorklet under `site/player/`. Static assets from `public/` are copied alongside them.

The GitHub Pages publisher must include `site/` in its artifact. Keep the diagnostics page available under `site/diagnostics/` when configuring the Pages workflow.

## CORS

The origin hosting the `.sng` file must allow browser access from the embedding page. The Render Server must separately allow the embedding page's origin. The SoundFont host must also allow cross-origin fetch requests.

Audio playback starts only after the visitor presses Play, as required by browser autoplay policies. Each element owns its own playback state.

This is the first implementation draft and still needs a browser integration test against the deployed Render Server and the selected SoundFont.


## Browser caching and loading progress

The player stores the downloaded SoundFont in the browser's Cache API under
`jjazzlab-player-soundfonts-v1`. Later player instances on the same browser
and site can reuse the cached file instead of downloading it again. The browser
may still evict cached data, for example when storage is under pressure or the
user clears site data.

If the SoundFont file is replaced while keeping the same URL, increment the
cache name in `player/src/jjazzlab-player.js` (for example, from
`jjazzlab-player-soundfonts-v1` to `...-v2`) so visitors download the new file.

A small progress indicator is shown while the song, rendered MIDI response,
and SoundFont are downloaded. It displays a percentage when the server provides
a content length; otherwise it uses an indeterminate progress animation.
