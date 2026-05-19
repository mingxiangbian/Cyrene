# Cyrene Avatar Asset Design

## Goal

Replace the current CSS placeholder avatars with two generated image assets that make Cyrene feel more intentional in the Web UI:

- a realistic portrait avatar for the sidebar brand identity
- a simplified cartoon mascot avatar for assistant message identity

The assets should support the existing glassmorphism/neumorphism UI direction without making the interface visually noisy.

## Current Problem

The current avatar treatment is not acceptable for the intended identity:

- The sidebar avatar is a CSS gradient placeholder, not a real image.
- The previous realistic generation looked too illustrated and did not feel like a real person.
- The previous cartoon generation was too detailed for a small chat avatar.
- Assistant responses can show excess top spacing when returned text begins with leading newlines.
- The composer placeholder can appear vertically off-center because the textarea currently starts as a taller multi-line control.

This spec covers the avatar asset direction and the adjacent UI fit needed for those assets to work well.

## Visual Direction

### Realistic Sidebar Avatar

Use direction A from brainstorming: realistic person portrait with pink-hair identity preserved.

The portrait should look like a real person rather than anime, semi-real illustration, or painted character art. It should read as a high-end AI product persona or virtual spokesperson:

- photorealistic or near-photorealistic portrait
- real skin texture, natural facial proportions, realistic eyes, realistic hair texture
- pink long hair retained as the main identity signal
- violet or purple-tinted eyes retained, but rendered believably
- subtle future-tech styling through clothing, lighting, and material accents
- translucent white-blue prism jacket or collar detail is allowed
- soft pink, cyan, lavender, and white palette aligned with the current UI
- clean head-and-shoulders or close bust composition
- generous crop padding for rounded-square display

Avoid:

- anime face structure
- illustration linework
- chibi proportions
- excessive cosplay staging
- heavy accessories
- busy city backgrounds
- text, watermark, logos, or decorative symbols

### Cartoon Assistant Avatar

Use direction B from brainstorming: minimal mascot face.

The assistant message avatar should be optimized for the small chat identity slot, not for full character display:

- simplified mascot face or compact head icon
- pink hair silhouette
- purple eyes
- gentle friendly expression
- one or two soft glassy highlights at most
- pastel pink/cyan/lavender palette
- clean circular crop compatibility
- crisp enough to remain readable around 30px

Avoid:

- full-body or half-body sticker composition
- multiple accessories
- background stars, gems, shapes, or decorative clusters
- complex jacket details
- detailed braids that become noisy at small size
- text, watermark, or logos

## Asset Usage

The two assets are generated independently because they have different jobs:

- The realistic avatar prioritizes realism and product identity.
- The cartoon avatar prioritizes small-size readability and friendliness.

They should remain visually related through:

- pink hair
- purple eyes
- soft prism/glass lighting
- pink, cyan, lavender, and white palette
- calm, professional expression

They do not need to match pose, crop, or rendering style exactly.

## UI Fit Requirements

The final implementation should:

- store assets under the Web static asset directory with stable names
- render the realistic asset in the sidebar brand avatar
- render the cartoon asset in assistant message identity rows
- preserve rounded or circular masking so assets fit the existing UI
- avoid adding new decorative clutter around either image
- display assistant message text without leading/trailing whitespace artifacts
- keep the composer placeholder vertically centered in the default empty state

## Acceptance Criteria

The avatar pass is acceptable when:

- The sidebar avatar reads as a realistic person at first glance.
- The sidebar avatar still clearly feels like Cyrene through pink hair and prism UI colors.
- The assistant avatar reads clearly at small chat-avatar size.
- The assistant avatar is simpler than the previously generated cartoon image.
- Neither image has text, watermark, logos, or cluttered backgrounds.
- Circular or rounded-square cropping does not cut off important facial features.
- Assistant responses with leading newlines do not render with large blank space above the text.
- The composer placeholder appears vertically centered before the user types.
- Existing sidebar collapse, inspector, Enter send, and Shift+Enter newline behavior remain unchanged.

## Out Of Scope

This pass does not add:

- multi-avatar selection
- user-uploaded avatars
- session persistence
- animated avatars
- full mascot illustrations elsewhere in the UI
- Figma export

## Verification Plan

Use a mix of automated and visual checks:

- Static tests should cover stable asset references, assistant text trimming, and composer default sizing.
- TypeScript and the existing test suite should continue to pass.
- Browser QA should verify default UI, assistant response rendering, and composer placeholder alignment.
- Visual inspection should compare the generated realistic and cartoon assets against this spec before they are committed into the UI.
