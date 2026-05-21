# T2I Detail Enhance Design

## Goal

Improve local SD1.5 image generation for the user's main failure mode: faces, eyes, hands, and human details coming out distorted. Keep the agent workflow simple: the user asks for an image, the agent generates an image, and the tool returns image files under the active workspace.

## Assumptions

- The first detail-enhance pass targets A-class failures: face, eye, hand, and person-detail defects.
- The current txt2img path remains the primary entry point.
- The worker should not depend on Automatic1111 WebUI extensions at runtime.
- Generated files remain under the active workspace `generated-images/` directory.
- The first implementation should favor a small, testable enhancement pipeline over full img2img or manual inpainting UX.

## Decisions

- Keep `generate_image` as the public tool.
- Add optional detail-enhance controls to `generate_image`; do not create a separate user-facing tool yet.
- Implement an ADetailer-like pipeline inside the local worker: detect target regions, build masks, inpaint only those regions, composite back, and save the final PNG.
- Start with automatic face/person detail enhancement. Hand enhancement uses the same interface, but can be unavailable until a suitable local detector is installed.
- Return the final enhanced image path by default. Intermediate images are only saved when explicitly requested for debugging.
- Do not add manual mask input in this iteration.
- Do not add full img2img, Hires.fix, Dynamic Thresholding, BMAB, or Automatic1111 plugin integration in this iteration.

## Approach Options

### Recommended: Automatic Local Detail Enhance

The worker runs txt2img first, detects detail regions, then applies inpainting to those regions. This directly addresses the current quality issue while preserving the simple generate-image workflow.

Tradeoff: it adds detector dependencies and makes generation slower, but the behavior is targeted and easy for the agent to use.

### Alternative: Whole-Image Img2img Refinement

The worker could run the generated image through img2img with low denoise strength.

Tradeoff: this is simpler than detection plus masks, but it is less targeted and can unintentionally change composition, clothing, or style.

### Alternative: Full Inpainting Tool

Add a separate inpainting tool with `image_path`, `mask_path`, and prompt inputs.

Tradeoff: it is powerful, but it pushes mask creation into the agent or user workflow. This is useful later, not as the first fix for automatic human-detail failures.

## Architecture

The TypeScript tool remains responsible for parameter validation, output-directory safety, worker calls, and response formatting.

The Python worker owns model execution:

1. Load the existing SD1.5 txt2img pipeline at startup.
2. Lazily load an inpaint pipeline and local detector only when detail enhancement is requested.
3. Generate the base image with the existing txt2img settings.
4. Detect target regions on the base image.
5. Expand each detection box with padding.
6. Build a soft mask for each region.
7. Run inpainting with a detail prompt and conservative denoise strength.
8. Composite results back into the image.
9. Save the final PNG and return metadata.

The worker still serializes generation requests. Detail enhancement is not concurrency-safe on local GPU/MPS memory.

## Tool Interface

Extend `generate_image` inputs:

```ts
{
  prompt: string
  negative_prompt?: string
  width?: number
  height?: number
  steps?: number
  cfg_scale?: number
  seed?: number
  count?: number
  detail_enhance?: boolean
  detail_targets?: 'auto' | 'face' | 'hand' | 'person'
  detail_strength?: number
  return_intermediate?: boolean
}
```

Defaults:

- `detail_enhance`: `false`
- `detail_targets`: `auto`
- `detail_strength`: `0.35`
- `return_intermediate`: `false`

Validation:

- `detail_strength` must be within `0.1..0.7`.
- Detail enhancement is allowed for `count` up to `4`, but the worker may process images sequentially.
- The tool should describe detail enhancement as slower than normal generation.

## Worker Request

`POST /generate` adds optional fields:

```json
{
  "detail_enhance": true,
  "detail_targets": "auto",
  "detail_strength": 0.35,
  "return_intermediate": false
}
```

Worker response keeps the existing shape and adds optional metadata:

```json
{
  "model": "majicmixRealistic_v7",
  "images": [
    {
      "path": "/absolute/workspace/generated-images/123.png",
      "seed": 123,
      "width": 512,
      "height": 768,
      "detail_enhanced": true,
      "detail_regions": 2
    }
  ]
}
```

If no regions are detected, generation still succeeds and returns the base image with `detail_enhanced: false` and `detail_regions: 0`.

## Detection Strategy

Use a local detector that can run without the Automatic1111 extension host. Prefer a YOLO-style detector when available because ADetailer and BMAB both center their value around automatic region selection before inpainting.

Initial detector priority:

1. Face/person detector for reliable first-pass improvement.
2. Hand detector when a suitable local model is installed.

Detector model files should be treated like other local model artifacts and ignored by git. If detector weights are not installed, the worker should return a clear error when the requested `detail_targets` cannot run. For `auto`, the worker may proceed with available targets and report which targets were enhanced.

## Prompting Strategy

The detail pass should reuse the original prompt and negative prompt, with a small internal prefix for the target:

- face: `detailed face, sharp eyes, natural skin texture`
- person: `anatomically coherent person, detailed features`

The inpaint denoise strength should default to `detail_strength` and remain conservative so the detail pass fixes local artifacts without changing the image identity.

## Error Handling

- If the worker is unavailable, keep the existing tool error.
- If detail enhancement dependencies are missing and `detail_enhance` is false, normal txt2img should still work.
- If detail enhancement dependencies are missing and `detail_enhance` is true, return a clear dependency error with the setup command.
- If detection finds no regions, do not fail the generation.
- If one region fails to inpaint, fail the enhanced generation clearly rather than silently returning a partially modified image.

## Non-Goals

- No manual mask UI.
- No separate `inpaint_image` tool.
- No whole-image img2img refinement.
- No Hires.fix upscaling.
- No Dynamic Thresholding.
- No BMAB or ADetailer extension runtime.
- No automatic Markdown file edits.
- No committing detector weights, model weights, or generated images.

## Verification

Implementation is complete when:

1. `generate_image` still works with existing txt2img defaults.
2. `generate_image` accepts `detail_enhance: true` and returns an existing PNG path.
3. Detail enhancement writes outputs under the active workspace `generated-images/` directory.
4. If no regions are detected, the tool succeeds and reports zero enhanced regions.
5. If detail dependencies are missing, normal txt2img still works and enhanced generation returns a clear error.
6. Focused tests cover TypeScript argument validation, worker request shape, response parsing, and metadata formatting.
7. Existing tests pass.
8. A manual smoke test generates one portrait with `detail_enhance: true` and records the output path.
