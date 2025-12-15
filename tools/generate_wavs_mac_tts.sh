#!/usr/bin/env bash
# generate_wavs_mac_tts.sh
# Use macOS `say` to generate WAV files for each word and convert to 16-bit PCM WAV
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/assets/audio"
mkdir -p "$OUT_DIR"

words=(cat dog ball milk cow duck car tree fish bird shoe hat book cup egg star apple banana chair bed)

for w in "${words[@]}"; do
  tmpfile="$OUT_DIR/$w.aiff"
  wavfile="$OUT_DIR/$w.wav"
    # Generate using say to AIFF first (macOS TTS). Use default voice; if it
    # fails, try a common voice like Alex.
    if ! say -o "$tmpfile" "$w" 2>/dev/null; then
      echo "say failed with default voice, retrying with Alex"
      say -v Alex -o "$tmpfile" "$w"
    fi
    # Convert to 16-bit PCM WAV at 22050 Hz
    if afconvert -f WAVE -d LEI16@22050 "$tmpfile" "$wavfile" >/dev/null 2>&1; then
      :
    else
      echo "afconvert failed for $w, moving AIFF as fallback"
      # If conversion failed, try converting to WAV with default params
      if afconvert "$tmpfile" "$wavfile" >/dev/null 2>&1; then
        :
      else
        mv "$tmpfile" "$wavfile"
      fi
    fi
  rm -f "$tmpfile"
  echo "Wrote $wavfile"
done

echo "Done."