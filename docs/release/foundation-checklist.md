# Foundation Release Checklist

Use this checklist for foundation release smoke checks before handing off or
shipping a build. Keep `notes/**` out of routine verification unless a task
explicitly asks for note data.

## Build And Test

- [ ] `pnpm.cmd build` passes.
- [ ] `cargo test` passes when Rust files changed.
- [ ] Non-notes worktree status is clean:
  `git status --short -- . ":(exclude)notes/**"`.

## Settings Center Smoke

- [ ] Settings Center opens successfully.
- [ ] Appearance page is present and visually unchanged from the expected
  baseline.
- [ ] Theme mode switching works for light, dark, and system.
- [ ] Accent color persists after changing it and reopening Settings.
- [ ] Contrast setting persists after changing it and reopening Settings.
- [ ] Translucent sidebar setting persists after changing it and reopening
  Settings.
- [ ] Pointer setting persists after changing it and reopening Settings.
- [ ] Reduced-motion setting persists after changing it and reopening Settings.
- [ ] Settings search finds the major sections, including Appearance, Luogu,
  Import, and Search.

## Feature Smoke

- [ ] Luogu rules area opens and displays expected controls.
- [ ] Import Center opens and completes a basic smoke check without errors.
- [ ] Search empty state displays correctly.
- [ ] Search recent state displays correctly when recent searches exist.
- [ ] Search fallback results display correctly when backend results are not
  available.
- [ ] Search backend results display correctly when backend results are
  available.
