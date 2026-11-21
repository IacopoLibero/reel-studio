# Voice sample

The reels speak with a cloned voice. VoiceStudio (engine VoxCPM2) needs a short sample of the voice you want.
In the New brand page the voice step does the steps below for you (it can suggest voices, or take a WAV you upload).

Where the files go, inside `<brand folder>/`:

- A brand **without a character**: `identity/voice.wav`, `identity/voice.txt`, optional `identity/voice.json`.
- A brand **with a character** (named `<id>`): `mascot/<id>-voice.wav`, `mascot/<id>-voice.txt`, optional `mascot/<id>-voice.json`.
  The character's voice is the only voice of that brand.

1. Record 10 to 20 seconds of one speaker, clean and quiet, no music, no echo. Your own voice, or a voice you have the right to clone.
2. Save it as the `.wav` file above (mono or stereo WAV, any common sample rate).
3. Write the exact words spoken in the sample in the `.txt` file, one paragraph, no extra text.
   The engine uses these words to line the voice up with the audio, so a typo makes the clone worse.
4. Optional `.json`: `{ "speed": 0.9, "gap": 0.4 }`. `speed` below 1 slows every sentence (pitch is kept),
   `gap` is the pause between sentences in seconds.
5. Make the voice in a reel with: `node scripts/voice.mjs <brand folder>/reels/<reel> <voiceName>=<brand folder>/<the .wav above>`.

Only clone voices of people who agreed to it.
