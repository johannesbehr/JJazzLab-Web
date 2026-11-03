package org.jjazzlab.web.render.runtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import javax.sound.midi.MetaMessage;
import javax.sound.midi.MidiEvent;
import javax.sound.midi.MidiSystem;
import javax.sound.midi.Sequence;
import javax.sound.midi.Track;
import org.jjazz.chordleadsheet.api.item.CLI_ChordSymbol;
import org.jjazz.harmony.api.Position;
import org.jjazz.midimix.api.MidiMix;
import org.jjazz.midimix.spi.MidiMixManager;
import org.jjazz.musiccontrol.api.ControlTrack;
import org.jjazz.musiccontrol.api.playbacksession.PlaybackSession;
import org.jjazz.musiccontrol.api.playbacksession.SessionConfig;
import org.jjazz.musiccontrol.api.playbacksession.BaseSongSession;
import org.jjazz.outputsynth.spi.OutputSynthManager;
import org.jjazz.rhythm.api.MusicGenerationException;
import org.jjazz.song.api.Song;
import org.jjazz.song.api.SongCreationException;
import org.jjazz.song.spi.SongContextFactory;
import org.jjazz.song.spi.SongFactory;
import org.jjazz.song.api.SongContext;
import org.jjazz.chordleadsheet.api.UnsupportedEditException;

/**
 * Renders a JJazzLab song to MIDI and extracts playback metadata from the same
 * generated playback session. The session is request-scoped and always closed.
 */
public final class SongRenderService {

    private static final ObjectMapper JSON = new ObjectMapper();

    public RenderOutput render(Path songFile)
            throws SongCreationException, UnsupportedEditException,
            MusicGenerationException, IOException {

        Song song = SongFactory.getDefault().loadFromFile(songFile.toFile());
        MidiMix midiMix = MidiMixManager.getDefault().createMix(song);

        // Match instruments to the default output synth (including drum-channel routing).
        OutputSynthManager.getDefault().getDefaultOutputSynth().fixInstruments(midiMix, true);

        SongContext songContext = SongContextFactory.getDefault().of(song, midiMix);
        SessionConfig config = new SessionConfig(false, false, true, 1, null);
        BaseSongSession session = new BaseSongSession(
                songContext, config, false, PlaybackSession.Context.SONG);

        try {
            session.generate(true);

            Sequence sequence = session.getSequence();
            if (sequence == null) {
                throw new MusicGenerationException("The rendering engine produced no MIDI sequence.");
            }

            ControlTrack controlTrack = session.getControlTrack();
            ObjectNode metadata = createMetadata(song, songContext, sequence, controlTrack);
            byte[] midi = writeMidi(sequence);

            ObjectNode response = JSON.createObjectNode();
            response.put("success", true);
            response.put("engineVersion", JJazzLabRuntime.ENGINE_VERSION);
            response.set("metadata", metadata);

            return new RenderOutput(response, midi);
        } finally {
            session.close();
        }
    }

    private ObjectNode createMetadata(
            Song song, SongContext songContext, Sequence sequence, ControlTrack controlTrack) {

        ObjectNode metadata = JSON.createObjectNode();
        metadata.put("ticksPerQuarterNote", sequence.getResolution());
        metadata.put("totalBars", songContext.getBarRange().size());

        ArrayNode tempoMap = metadata.putArray("tempoMap");
        ArrayNode timeSignatureMap = metadata.putArray("timeSignatureMap");
        readMidiMaps(sequence, tempoMap, timeSignatureMap, song);

        ArrayNode positions = metadata.putArray("positions");
        if (controlTrack != null) {
            controlTrack.getMidiEvents().stream()
                    .filter(event -> event.getMessage() instanceof MetaMessage)
                    .filter(event -> ((MetaMessage) event.getMessage()).getType()
                            == ControlTrack.CHORD_SYMBOL_META_EVENT_TYPE)
                    .sorted((a, b) -> Long.compare(a.getTick(), b.getTick()))
                    .forEach(event -> {
                        MetaMessage message = (MetaMessage) event.getMessage();
                        CLI_ChordSymbol chord = controlTrack.getChordSymbol(message);
                        Position position = chord.getPosition();

                        ObjectNode item = positions.addObject();
                        // ControlTrack deliberately shifts marker events by one tick so that
                        // MIDI sequencers reliably fire the first marker at tick zero.
                        item.put("tick", Math.max(0L, event.getTick() - 1L));
                        item.put("bar", position.getBar() + 1);
                        item.put("beat", position.getBeat() + 1.0d);
                        item.put("chord", chord.getData().getOriginalName());
                    });
        }

        return metadata;
    }

    private void readMidiMaps(
            Sequence sequence, ArrayNode tempoMap, ArrayNode timeSignatureMap, Song song) {

        if (sequence.getTracks().length == 0) {
            return;
        }

        Track conductorTrack = sequence.getTracks()[0];
        for (int i = 0; i < conductorTrack.size(); i++) {
            MidiEvent event = conductorTrack.get(i);
            if (!(event.getMessage() instanceof MetaMessage message)) {
                continue;
            }

            byte[] data = message.getData();
            if (message.getType() == 0x51 && data.length == 3) {
                int microsPerQuarter = ((data[0] & 0xff) << 16)
                        | ((data[1] & 0xff) << 8)
                        | (data[2] & 0xff);
                if (microsPerQuarter > 0) {
                    ObjectNode item = tempoMap.addObject();
                    item.put("tick", event.getTick());
                    item.put("bpm", 60_000_000.0d / microsPerQuarter);
                }
            } else if (message.getType() == 0x58 && data.length >= 2) {
                ObjectNode item = timeSignatureMap.addObject();
                item.put("tick", event.getTick());
                item.put("numerator", data[0] & 0xff);
                item.put("denominator", 1 << (data[1] & 0xff));
            }
        }

        if (tempoMap.isEmpty()) {
            ObjectNode item = tempoMap.addObject();
            item.put("tick", 0);
            item.put("bpm", song.getTempo());
        }

        if (timeSignatureMap.isEmpty()) {
            var timeSignature = song.getChordLeadSheet().getSection(0).getData().getTimeSignature();
            ObjectNode item = timeSignatureMap.addObject();
            item.put("tick", 0);
            item.put("numerator", timeSignature.getUpper());
            item.put("denominator", timeSignature.getLower());
        }
    }

    private byte[] writeMidi(Sequence sequence) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        int bytesWritten = MidiSystem.write(sequence, 1, output);
        if (bytesWritten <= 0) {
            throw new IOException("No supported MIDI file format is available for the generated sequence.");
        }
        return output.toByteArray();
    }

    public record RenderOutput(ObjectNode metadata, byte[] midi) {
    }
}
