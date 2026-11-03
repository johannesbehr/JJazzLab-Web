package org.jjazzlab.web.render.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.jjazzlab.web.render.runtime.JJazzLabRuntime;

/**
 * Reports HTTP service and rendering-engine readiness.
 */
@WebServlet(urlPatterns = "/api/v1/health")
public final class HealthServlet extends HttpServlet {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String SERVER_VERSION = "0.1.0-SNAPSHOT";

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws IOException {

        boolean ready = JJazzLabRuntime.isReady();

        Map<String, Object> engine = new LinkedHashMap<>();
        engine.put("name", "JJazzLab");
        engine.put("version", JJazzLabRuntime.ENGINE_VERSION);
        engine.put("status", ready ? "ready" : "not_ready");

        Map<String, Object> runtime = new LinkedHashMap<>();
        runtime.put("javaVersion", System.getProperty("java.version"));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", ready ? "ok" : "not_ready");
        body.put("apiVersion", "1");
        body.put("serverVersion", SERVER_VERSION);
        body.put("engine", engine);
        body.put("runtime", runtime);

        if (!ready && JJazzLabRuntime.getInitializationError() != null) {
            body.put("message", JJazzLabRuntime.getInitializationError());
        }

        response.setStatus(ready
                ? HttpServletResponse.SC_OK
                : HttpServletResponse.SC_SERVICE_UNAVAILABLE);
        response.setCharacterEncoding("UTF-8");
        response.setContentType("application/json");
        JSON.writeValue(response.getOutputStream(), body);
    }
}
