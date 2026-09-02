/**
 * NVIDIA NIM model registry.
 *
 * Every LLM call in Publish goes through this map. Choosing "reasoning" vs "fast"
 * is a routing decision, not a model-name decision — so we can swap providers or
 * upgrade to a newer NIM release without touching feature code.
 */

import { env } from '../env';

export const NIM_MODELS = {
  /**
   * Long-context reasoning + structured JSON.
   * Used for: script analysis, hook rewrites, humanizer, policy checks.
   */
  reasoning: env.NVIDIA_MODEL_REASONING || 'nvidia/llama-3.3-nemotron-super-49b-v1',

  /**
   * Speed-optimized generation.
   * Used for: SEO titles, description rewrites, quick suggestions.
   */
  fast: env.NVIDIA_MODEL_FAST || 'meta/llama-3.3-70b-instruct',

  /**
   * Multimodal — accepts images.
   * Used for: thumbnail analysis (composition, faces, text legibility).
   */
  vision: env.NVIDIA_MODEL_VISION || 'meta/llama-3.2-90b-vision-instruct',
} as const;

export type NimModelKind = keyof typeof NIM_MODELS;
