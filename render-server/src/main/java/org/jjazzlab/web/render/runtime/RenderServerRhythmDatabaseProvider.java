package org.jjazzlab.web.render.runtime;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Future;
import java.util.logging.Logger;
import org.jjazz.rhythmdatabase.api.DefaultRhythmDatabaseImpl;
import org.jjazz.rhythmdatabase.api.RhythmDatabase;
import org.jjazz.rhythmdatabase.spi.SharedRdbInstanceProvider;
import org.openide.util.NbPreferences;
import org.openide.util.lookup.ServiceProvider;

/**
 * Provides the shared rhythm database required by the standalone JJazzLab Toolkit.
 */
@ServiceProvider(service = SharedRdbInstanceProvider.class)
public final class RenderServerRhythmDatabaseProvider implements SharedRdbInstanceProvider {

    private static final Logger LOGGER =
            Logger.getLogger(RenderServerRhythmDatabaseProvider.class.getName());

    private volatile DefaultRhythmDatabaseImpl rhythmDatabase;
    private volatile boolean markedForStartupRefresh;

    @Override
    public synchronized Future<?> initialize() {
        if (rhythmDatabase == null) {
            LOGGER.info("Initializing JJazzLab rhythm database");
            DefaultRhythmDatabaseImpl database =
                    new DefaultRhythmDatabaseImpl(NbPreferences.forModule(getClass()));
            database.addRhythmsFromRhythmProviders(false, false, false);
            rhythmDatabase = database;
            LOGGER.info(() -> "JJazzLab rhythm database initialized: "
                    + database.getRhythms().size() + " rhythms");
        }
        return CompletableFuture.completedFuture(null);
    }

    @Override
    public boolean isInitialized() {
        return rhythmDatabase != null;
    }

    @Override
    public RhythmDatabase get() {
        if (!isInitialized()) {
            initialize();
        }
        return rhythmDatabase;
    }

    @Override
    public void markForStartupRefresh(boolean marked) {
        markedForStartupRefresh = marked;
    }

    @Override
    public boolean isMarkedForStartupRefresh() {
        return markedForStartupRefresh;
    }
}
