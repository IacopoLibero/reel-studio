/**
 * The ways VoiceStudio can run. VoiceStudio has many voice engines; Reel Studio offers a few ready-made modes so the user
 * chooses by what matters (speed, quality, disk) and not by engine name. The choice is made in the setup screen and can change later.
 */
export interface VoiceMode {
  id: string;
  label: string;
  description: string;
  /** The VoiceStudio engine to select (null for "none"). */
  engine: string | null;
  device: "gpu" | "cpu" | null;
  /** Download size, in GB (Python packages plus model weights). */
  downloadGb: number;
  needsGpu: boolean;
  cloning: boolean;
}

export const VOICE_MODES: readonly VoiceMode[] = [
  { id: "gpu-voxcpm2", label: "Best quality (NVIDIA GPU)", description: "VoxCPM2 on the graphics card: natural voices in many languages, can copy a voice from a short sample.", engine: "voxcpm2", device: "gpu", downloadGb: 15, needsGpu: true, cloning: true },
  { id: "cpu-voxcpm2", label: "Best quality, slow (processor only)", description: "The same VoxCPM2 voices on the processor. A reel's voice takes minutes instead of seconds.", engine: "voxcpm2", device: "cpu", downloadGb: 6, needsGpu: false, cloning: true },
  { id: "light-kittentts", label: "Light and fast (English only)", description: "KittenTTS: small and quick on any computer, eight fixed English voices, no voice copying.", engine: "kittentts", device: "cpu", downloadGb: 1, needsGpu: false, cloning: false },
  { id: "none", label: "No voice for now", description: "Skip it. Reels can still be planned and built; add a voice later from Settings.", engine: null, device: null, downloadGb: 0, needsGpu: false, cloning: false },
];

export const voiceMode = (id: string | null | undefined): VoiceMode | null => VOICE_MODES.find((m) => m.id === id) ?? null;

/** The mode to pre-select: the GPU one when an NVIDIA card was found, the processor one otherwise. */
export function recommendMode(gpu: string | null): VoiceMode {
  return voiceMode(gpu && /nvidia/i.test(gpu) ? "gpu-voxcpm2" : "cpu-voxcpm2") as VoiceMode;
}
