# Recall Box desktop icon

Generated with the built-in image generation tool. The transparent PNG source is `icon.png`.

## Prompt

Use case: logo-brand. Asset type: production Windows desktop app icon for Recall Box, a personal knowledge and spaced-repetition app. Create one polished standalone square app icon with a genuinely transparent background outside the icon. A deep muted olive-charcoal rounded-square tile, matching a warm calm note-taking app palette. In the center, a crisp ivory open-book silhouette combined with a single elegant sage-teal circular recall loop wrapping around the book, with one small warm amber spark to suggest remembered knowledge. Strong simple silhouette, balanced negative space, bold forms readable at 24px and 32px, restrained dimensional bevel and very subtle lighting, front view. Fill about 90 percent of the canvas with the rounded-square tile; transparent corners. No text, no letters, no tiny detail, no mockup, no scenery, no external shadows, no watermark.

## Windows resources

Run `go generate ./cmd/desktop` to regenerate `assets/icon.ico` and the Windows amd64/arm64 `.syso` resources. The ICO contains multiple sizes for Explorer, the taskbar, and the title bar. The Windows resource uses ID 32512, matching the icon Wails loads for native windows. `application.Options.Icon` embeds the PNG for the app icon on other platforms.
