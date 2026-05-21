# T2I Safe Preset and Dynamic Thresholding Design

Date: 2026-05-22
Status: Approved for planning

## Context

The project has a local SD1.5 text-to-image worker exposed through the
`generate_image` tool. The target model is the local V7 realistic checkpoint
under `T2I/`, with style guidance from `T2I/Requirement.md`.

The user's target machine is an Apple M3 MacBook Pro with 16 GB memory and MPS
available. This favors a stable default path over maximum quality settings. The
tool must work from agent, CLI/REPL, and Web UI flows, and it should return image
file paths that can be embedded into Markdown by the caller. It should not write
Markdown files automatically.

`T2I/Requirement.md` recommends Dynamic Thresholding, hires upscaling, ADetailer,
and BMAB-style postprocessing. Real ESRGAN/UltraSharp/NMKD upscaler weights are
not currently part of the local model bundle, so this design does not add a hard
dependency on `.pth` upscaler weights.

## Goals

- Add a default-on safe preset tuned for the local M3 16 GB environment.
- Add Dynamic Thresholding-style CFG control without requiring extra model
  weights.
- Keep the current stable hires path based on image resizing plus low-denoise
  img2img refinement.
- Make every automatic preset adjustment visible in the tool response metadata.
- Preserve an escape hatch for advanced manual generation with `safe_preset:
  false`.

## Non-Goals

- Do not add real ESRGAN, UltraSharp, or NMKD upscaler weight loading in this
  iteration.
- Do not auto-download model or upscaler weights.
- Do not auto-create Markdown documents or Markdown snippets.
- Do not change the ignored `T2I/` asset layout beyond documenting that real
  upscaler weights are deferred.

## Tool API

Add these `generate_image` arguments:

- `safe_preset?: boolean`, default `true`.
- `dynamic_thresholding?: boolean`, default `true` when `safe_preset` is enabled.
- `dynamic_thresholding_mimic_scale?: number`, default `7`.
- `dynamic_thresholding_percentile?: number`, default `0.995`.

Do not add `upscaler` or `upscaler_model_path` yet. The only supported upscaling
path remains the existing stable hires flow.

## Safe Preset Behavior

When `safe_preset` is omitted or `true`, the tool applies an M3-safe generation
profile even if the caller supplies riskier values. The response must include
`preset: "m3_16gb_safe"` and a `preset_adjustments` list describing overridden
fields.

Safe preset values:

- `width: 512`
- `height: 768`
- `steps: 20`
- `cfg_scale: 7`
- `count: 1`
- `hires_fix: true`
- `hires_scale: 2`
- `hires_steps: 15`
- `hires_denoise: 0.15`
- `detail_enhance: true`
- `detail_targets: "face"`
- `detail_strength: 0.1`
- `eye_refine: true`
- `eye_refine_strength: 0.12`
- `eye_refine_steps: 12`
- `bmab_postprocess: true`
- `dynamic_thresholding: true`
- `dynamic_thresholding_mimic_scale: 7`
- `dynamic_thresholding_percentile: 0.995`

When `safe_preset` is `false`, the caller's explicit values are preserved subject
to existing validation ranges. This is the path for experiments such as high CFG,
larger dimensions, multiple images, or future upscaler testing.

## Dynamic Thresholding Design

Implement a conservative Dynamic Thresholding-style latent limiter in the Python
worker. The implementation should use Diffusers' `callback_on_step_end` support
to inspect the `latents` tensor during sampling, cap extreme values at the
configured percentile, and rescale the tensor toward `dynamic_thresholding_mimic_scale`.

This is intended to control high-CFG saturation and contrast blowout for the
local SD1.5 checkpoint. It is not a full clone of the Automatic1111 extension.

Validation:

- `dynamic_thresholding` must be boolean.
- `dynamic_thresholding_mimic_scale` must be positive and should accept practical
  values in the 1 to 20 range.
- `dynamic_thresholding_percentile` must be greater than 0.9 and less than 1.

If the installed Diffusers version does not support the required callback API,
the worker should return a clear error rather than silently ignoring the setting.

## Upscaler Decision

This iteration keeps the stable hires flow:

1. Generate the base image at the safe preset size.
2. Resize with the current deterministic local resize path.
3. Refine with low-denoise img2img.

No `.pth` upscaler file is required. This avoids adding a new dependency stack
and avoids memory pressure on the local M3 16 GB machine. If a real upscaler is
added later, it should be a separate design with explicit local weight paths and
fallback behavior.

## Data Flow

1. Agent, CLI/REPL, or Web UI calls `generate_image`.
2. TypeScript schema validates user input.
3. TypeScript normalization applies `safe_preset` and records adjustments.
4. The normalized request is sent to the Python worker.
5. The worker validates generation fields and runs SD1.5 sampling.
6. The worker writes PNG files under the configured generated-images directory.
7. The tool returns absolute and display-safe paths plus generation metadata.

The Web UI should continue to support image preview through Markdown/local file
paths, but the generator itself only returns files and metadata.

## Error Handling

- Invalid output directories continue to fail before worker invocation.
- Invalid Dynamic Thresholding ranges return validation errors.
- Worker callback incompatibility returns a clear worker error.
- Safe preset overrides are not treated as errors; they are reported as metadata.
- Generated images are not committed to git.

## Testing

Implementation should add or update tests for:

- TypeScript schema defaults for `safe_preset` and Dynamic Thresholding fields.
- `safe_preset: true` overriding risky user values and returning adjustments.
- `safe_preset: false` preserving explicit user values.
- Python payload validation for Dynamic Thresholding fields.
- Worker smoke behavior with Dynamic Thresholding enabled.

Verification should include the existing project test command for affected
TypeScript tests, Python syntax or unit checks for the worker, and one local
generation smoke test when the local model assets are available.

## Acceptance Criteria

- Default `generate_image` calls use the M3-safe preset.
- Dynamic Thresholding is enabled by default under the safe preset.
- Tool responses show `preset`, `preset_adjustments`, and Dynamic Thresholding
  metadata.
- No real upscaler weights are required for the default path.
- README documents the safe preset, Dynamic Thresholding defaults, and the
  decision to defer real local upscaler support.
- CLI/REPL and Web UI flows both receive usable image file paths.
