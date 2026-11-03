package org.jjazzlab.web.render.runtime;

import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.logging.Level;
import java.util.logging.Logger;
import org.jjazz.rhythmdatabase.api.RhythmDatabase;
import org.jjazz.rhythmdatabase.spi.SharedRdbInstanceProvider;

/**
 * Initializes and exposes the process-wide JJazzLab Toolkit runtime.
 *
 * Rendering requests use this shared, initialized engine. Song and MIDI data
 * remain request-scoped; no user session is stored here.
 */
public final class JJazzLabRuntime {

    public static final String ENGINE_VERSION = "5.2.1";

    private static final Logger LOGGER = Logger.getLogger(JJazzLabRuntime.class.getName());
    private static final AtomicBoolean READY = new AtomicBoolean(false);

    private static volatile String initializationError;

    private JJazzLabRuntime() {
    }

    public static synchronized void initialize() {
        if (READY.get()) {
            return;
        }

        try {
            Locale.setDefault(Locale.ENGLISH);

            SharedRdbInstanceProvider provider = SharedRdbInstanceProvider.getDefault();
            if (provider == null) {
                throw new IllegalStateException(
                        "No SharedRdbInstanceProvider is registered with the JJazzLab Toolkit");
            }

            RhythmDatabase database = provider.get();
            if (database == null || database.getRhythms().isEmpty()) {
                throw new IllegalStateException("The rhythm database contains no available rhythms");
            }

            READY.set(true);
            initializationError = null;
            LOGGER.info("JJazzLab Toolkit runtime is ready");
        } catch (Exception ex) {
            // Keep implementation details in server logs only; health responses are public.
            initializationError = "Rendering engine initialization failed. Check server logs.";
            LOGGER.log(Level.SEVERE, "Could not initialize JJazzLab Toolkit runtime", ex);
        }
    }

    public static boolean isReady() {
        return READY.get();
    }

    public static String getInitializationError() {
        return initializationError;
    }
}
