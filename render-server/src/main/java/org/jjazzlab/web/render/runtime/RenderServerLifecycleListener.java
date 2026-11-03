package org.jjazzlab.web.render.runtime;

import jakarta.servlet.ServletContextEvent;
import jakarta.servlet.ServletContextListener;
import jakarta.servlet.annotation.WebListener;

/**
 * Starts the shared rendering engine during web application deployment.
 */
@WebListener
public final class RenderServerLifecycleListener implements ServletContextListener {

    @Override
    public void contextInitialized(ServletContextEvent event) {
        event.getServletContext().log("Starting JJazzLab Web Render Server");
        JJazzLabRuntime.initialize();
    }

    @Override
    public void contextDestroyed(ServletContextEvent event) {
        event.getServletContext().log("Stopping JJazzLab Web Render Server");
    }
}
