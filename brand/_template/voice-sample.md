# Voice sample

The reels speak with a cloned voice. VoiceStudio (engine VoxCPM2) needs a short sample of the voice you want.

1. Record 10 to 20 seconds of one speaker, clean and quiet, no music, no echo. Your own voice, or a voice you have the right to clone.
2. Save it as `brand/{{BRAND}}/voice.wav` (mono or stereo WAV, any common sample rate).
3. Write the exact words spoken in the sample in `brand/{{BRAND}}/voice.txt`, one paragraph, no extra text.
   The engine uses these words to line the voice up with the audio, so a typo makes the clone worse.
4. Optional `brand/{{BRAND}}/voice.json`: `{ "speed": 0.9, "gap": 0.4 }`. `speed` below 1 slows every sentence (pitch is kept),
   `gap` is the pause between sentences in seconds.
5. Make the voice in a reel with: `node scripts/voice.mjs reels/{{BRAND}}/<reel> <voiceName>=brand/{{BRAND}}/voice.wav`.

Only clone voices of people who agreed to it.
