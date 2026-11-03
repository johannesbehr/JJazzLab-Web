package org.jjazzlab.web.render.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.MultipartConfig;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.Part;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;
import org.jjazz.chordleadsheet.api.UnsupportedEditException;
import org.jjazz.rhythm.api.MusicGenerationException;
import org.jjazz.song.api.SongCreationException;
import org.jjazzlab.web.render.runtime.SongRenderService;
import org.jjazz.web.render.runtime.SongRenderService.RenderOutput;
import org.jjazz.web.render.runtime.JJazzLabRuntime;

/**
 * Accepts a .sng upload and returns a multipart response containing metadata
 * and MIDI bytes. Errors are returned as JSON without a MIDI part.
 */
@WebServlet(urlPatterns = "/api/v1/render")
@MultipartConfig(
        fileSizeThreshold = 0,
        maxFileSize = 20L * 1024L * 1024L,
        maxRequestSize = 21L * 1024L * 1024L
)
public final class RenderServlet extends HttpServlet {

    private static final Logger LOGGER = Logger.getLogger(RenderServlet.class.getName());
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final SongRenderService RENDERER = new SongRenderService();

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response)
            throws IOException {

        if (!JJazzLabRuntime.isReady()) {
            writeError(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE,
                    "RENDER_ENGINE_NOT_READY",
                    "The rendering engine is not ready. Check the server health endpoint.");
            return;
        }

        String contentType = request.getContentType();
        if (contentType == null || !contentType.toLowerCase().startsWith("multipart/form-data")) {
            writeError(response, HttpServletResponse.SC_UNSUPPORTED_MEDIA_TYPE,
                    "UNSUPPORTED_MEDIA_TYPE", "Expected multipart/form-data.");
            return;
        }

        Path uploadedSong = null;
        try {
            Part songPart;
            try {
                songPart = request.getPart("song");
            } catch (IllegalStateException ex) {
                writeError(response, HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE,
                        "PAYLOAD_TOO_LARGE", "The uploaded song exceeds the allowed size.");
                return;
            }

            if (songPart == null || songPart.getSize() == 0) {
                writeError(response, HttpServletResponse.SC_BAD_REQUEST,
                        "MISSING_SONG", "The multipart request must contain a non-empty 'song' file.");
                return;
            }

            for (Part part : request.getParts()) {
                if (!"song".equals(part.getName()) && part.getSize() > 0) {
                    writeError(response, HttpServletResponse.SC_BAD_REQUEST,
                            "UNSUPPORTED_FIELD", "The request contains an unsupported multipart field.");
                    return;
                }
            }

            uploadedSong = Files.createTempFile("jjazzlab-upload-", ".sng");
            try (InputStream input = songPart.getInputStream()) {
                Files.copy(input, uploadedSong, StandardCopyOption.REPLACE_EXISTING);
            }

            RenderOutput rendered = RENDERER.render(uploadedSong);
            writeMultipartResponse(response, rendered);

        } catch (SongCreationException ex) {
            LOGGER.log(Level.INFO, "The uploaded song could not be loaded: {0}", ex.getMessage());
            writeError(response, 422,
                    "INVALID_SONG", "The uploaded song could not be loaded as a valid JJazzLab song.");
        } catch (UnsupportedEditException | MusicGenerationException ex) {
            LOGGER.log(Level.INFO, "JJazzLab could not render the uploaded song: {0}", ex.getMessage());
            writeError(response, HttpServletResponse.SC_UNPROCESSABLE_CONTENT,
                    "RENDER_FAILED", "JJazzLab could not generate MIDI for the supplied song.");
        } catch (ServletException ex) {
            LOGGER.log(Level.INFO, "Invalid multipart request", ex);
            writeError(response, HttpServletResponse.SC_BAD_REQUEST,
                    "INVALID_MULTIPART_REQUEST", "The multipart request could not be parsed.");
        } catch (Exception ex) {
            LOGGER.log(Level.SEVERE, "Unexpected error while rendering song", ex);
            writeError(response, HttpServletResponse.SC_INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR", "An unexpected error occurred while rendering the song.");
        } finally {
            if (uploadedSong != null) {
                try {
                    Files.deleteIfExists(uploadedSong);
                } catch (IOException ex) {
                    LOGGER.log(Level.WARNING, "Could not delete temporary song upload", ex);
                }
            }
        }
    }

    private void writeMultipartResponse(HttpServletResponse response, RenderOutput rendered)
            throws IOException {

        String boundary = "jjazzlab-" + UUID.randomUUID();
        byte[] json = JSON.writeValueAsBytes(rendered.metadata());

        ByteArrayOutputStream body = new ByteArrayOutputStream();
        writeAscii(body, "--" + boundary + "\r\n");
        writeAscii(body, "Content-Type: application/json; charset=utf-8\r\n");
        writeAscii(body, "Content-ID: <metadata>\r\n\r\n");
        body.write(json);
        writeAscii(body, "\r\n--" + boundary + "\r\n");
        writeAscii(body, "Content-Type: audio/midi\r\n");
        writeAscii(body, "Content-ID: <midi>\r\n");
        writeAscii(body, "Content-Disposition: attachment; filename=\"song.mid\"\r\n\r\n");
        body.write(rendered.midi());
        writeAscii(body, "\r\n--" + boundary + "--\r\n");

        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType("multipart/mixed; boundary=\"" + boundary + "\"");
        response.setContentLengthLong(body.size());
        body.writeTo(response.getOutputStream());
    }

    private void writeError(
            HttpServletResponse response, int status, String code, String message)
            throws IOException {

        ObjectNode body = JSON.createObjectNode();
        body.put("success", false);
        ObjectNode error = body.putObject("error");
        error.put("code", code);
        error.put("message", message);
        error.set("details", JSON.valueToTree(List.of()));

        response.reset();
        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("application/json");
        JSON.writeValue(response.getOutputStream(), body);
    }

    private void writeAscii(ByteArrayOutputStream output, String value) throws IOException {
        output.write(value.getBytes(StandardCharsets.US_ASCII));
    }
}
