package org.jjazzlab.web.render.api;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.FilterConfig;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * CORS support scoped to the Render Server API.
 *
 * By default, browser clients from every origin are allowed. Set
 * JJAZZLAB_CORS_ORIGINS to a comma-separated list to restrict access.
 * Credentials are deliberately not enabled; the API is stateless.
 */
@WebFilter("/api/v1/*")
public final class CorsFilter implements Filter {

    private Set<String> allowedOrigins = Set.of();
    private boolean allowAnyOrigin = true;

    @Override
    public void init(FilterConfig filterConfig) {
        String configuredOrigins = System.getenv("JJAZZLAB_CORS_ORIGINS");

        // An unset or blank variable means the public default: allow every origin.
        if (configuredOrigins == null || configuredOrigins.isBlank()) {
            allowAnyOrigin = true;
            allowedOrigins = Set.of();
            return;
        }

        Set<String> origins = Arrays.stream(configuredOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .collect(Collectors.toUnmodifiableSet());

        allowAnyOrigin = origins.contains("*");
        allowedOrigins = origins;
    }

    @Override
    public void doFilter(
            ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        String origin = httpRequest.getHeader("Origin");
        boolean allowed = origin != null
                && (allowAnyOrigin || allowedOrigins.contains(origin));

        if (allowed) {
            httpResponse.setHeader("Access-Control-Allow-Origin",
                    allowAnyOrigin ? "*" : origin);
            httpResponse.addHeader("Vary", "Origin");
            httpResponse.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            httpResponse.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
            httpResponse.setHeader("Access-Control-Max-Age", "600");
        }

        if ("OPTIONS".equalsIgnoreCase(httpRequest.getMethod()) && allowed) {
            httpResponse.setStatus(HttpServletResponse.SC_NO_CONTENT);
            return;
        }

        chain.doFilter(request, response);
    }
}
