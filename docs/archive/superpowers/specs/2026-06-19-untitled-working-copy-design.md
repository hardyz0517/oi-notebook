# Untitled Working Copy Design

Date: 2026-06-19

## Goal

Add VS Code-like new-file behavior to the notebook editor:

- `Ctrl+N` creates an untitled, blank Markdown working copy.
- Creating a new working copy does not force-save or discard dirty content in the previous file.
- `Ctrl+S` saves the current working copy.
- If the current working copy has no path, `Ctrl+S` opens a native Windows save dialog where the user chooses the file name and location.
- If the chosen path is inside the current notes root, the saved file appears in the file tree and becomes the current note.
- If the chosen path is outside the current notes root, the file is saved to disk but is treated as an external file for now.
- The design must not make `notes/` a permanent assumption, because future workspaces should be able to choose any folder as the note root.

## Current Behavior

The current app has one active note path and one active dirty flag. File creation through the file tree immediately calls `writeNote(relativePath, content)`, so the file exists on disk as soon as it is named. `Ctrl+S` only works when `currentFilePath` points at an existing notes-relative file.

That model is too narrow for normal editor behavior. It cannot represent an unsaved file, and switching away from a dirty note risks conflating the previous note's state with the new editor state.

## Reference Model

Use the VS Code concept of working copies:

- A working copy is the in-memory editor state for one document.
- A working copy may be backed by a saved path or may be untitled.
- Dirty state belongs to the working copy, not to the whole app.
- Save either writes to the known path or, for untitled working copies, performs Save As.

This project should use that behavior model without importing VS Code code or adding unnecessary editor infrastructure.

## Proposed Architecture

Introduce an app-level working-copy layer in `src/App.tsx`.

Each working copy should track:

- `id`: stable UI identity, such as `note:<relativePath>`, `external:<absolutePath>`, or `untitled:<counter>`.
- `kind`: `note`, `external`, or `untitled`.
- `path`: notes-relative path for current notes files.
- `absolutePath`: native path for external files.
- `displayName`: shown in the title/status area, such as `Untitled-1` before save.
- `frontmatterPrefix`: existing parsed frontmatter prefix.
- `markdown`: current editor body.
- `savedSnapshot`: the last saved full content and path identity.
- `dirty`: whether current content differs from the saved snapshot.

The existing `currentFilePath`, `isDirty`, and `savedSnapshotRef` can remain as compatibility fields during the first implementation, but their values should be derived from the active working copy where possible. New logic should not assume `currentFilePath === null` means "nothing is open"; it can also mean an untitled or external working copy is active.

## Ctrl+N Behavior

`Ctrl+N` creates a new untitled working copy and switches the editor to it.

It should not prompt about dirty content in the previous working copy. The previous working copy remains in memory with its dirty state. If the previous working copy corresponds to a notes file, selecting that file from the tree restores the unsaved in-memory content instead of reloading from disk.

An untouched blank untitled working copy does not need to count as dirty for close-warning purposes. However, `Ctrl+S` must still be available for it and should open Save As, because users may intentionally want to create an empty file.

The existing file-tree inline creation behavior should remain available for direct creation inside the notes root. That flow still creates a named notes file immediately and is compatible with users who want a quick notes-local file.

## Ctrl+S Behavior

For a notes working copy:

- Save through the existing notes write path.
- Keep all existing frontmatter normalization and warning behavior.
- Refresh the saved snapshot and clear dirty state for that working copy.

For an untitled working copy:

- Open a native save dialog with Markdown-oriented defaults.
- If the user cancels, keep the working copy dirty and untitled.
- If the selected path is inside the current notes root, convert it to a notes-relative path and save through the notes API so current validation and frontmatter behavior still apply.
- If the selected path is outside the current notes root, save through a separate absolute-path API and mark the working copy as external.

For an external working copy:

- Save directly to its absolute path through the external-file API.
- Do not show it in the notes tree unless future workspace-root support makes that path part of the active note root.

## Notes Root Boundary

Add a narrow path service boundary instead of scattering notes-root assumptions through the UI.

The first version can still use the existing `notes/` directory internally, but it should expose helpers with names like:

- get current note root identity/path
- determine whether an absolute path is inside the active note root
- convert an absolute path to a root-relative path
- convert a root-relative path to an absolute path when needed

This prepares the app for future support where the active note root is any user-selected folder.

## Tauri API Shape

Keep frontend-to-Rust calls behind `src/lib/api.ts`.

Likely additions:

- `showSaveMarkdownDialog(defaultFileName): Promise<string | null>`
- `writeExternalMarkdownFile(absolutePath, content): Promise<void>`
- optionally `getNotesRootPath(): Promise<string>` if the frontend needs absolute root comparison

If the Tauri dialog plugin is added, wrap it in `src/lib/api.ts` or a small local API helper so UI code does not import plugin calls directly across the app.

Rust-side absolute-path writing must be separate from `write_note`. The existing notes path validation and two-layer safety checks in `src-tauri/src/notes.rs` must remain unchanged for notes-relative operations.

## Unsaved State And App Closing

Switching files should not warn about dirty state. Dirty working copies remain in memory.

Closing the whole app should warn if any working copy is dirty. If a close-prevention hook already exists, extend it to check all dirty working copies. If not, add one as part of implementation, using the app's existing confirmation style where possible.

## UI Expectations

Untitled documents should be visibly identifiable:

- Title/status display uses `Untitled-1`, `Untitled-2`, etc.
- Save status should show dirty state for the active working copy.
- The notes tree should continue to show notes-root files only.
- Saving an untitled file into notes should refresh the notes tree and select the saved file.

No new landing page, card-heavy UI, or large visual redesign is needed. This is editor behavior, not a new surface.

## Error Handling

- Canceling Save As is not an error.
- Invalid notes-relative paths should continue to use existing notes validation errors.
- External save failures should show a toast with the system error.
- If a selected Save As path is inside notes but conflicts with an existing file, native dialog overwrite confirmation may handle it. The app should still handle write errors cleanly.
- If a dirty in-memory notes working copy exists and the same file changes on disk, first implementation may keep the in-memory working copy as the source of truth and save over disk on `Ctrl+S`. More advanced conflict detection can be a later feature.

## Testing

Manual verification should cover:

- `Ctrl+N` creates an untitled blank editor.
- Editing an existing note, pressing `Ctrl+N`, and returning to the note preserves unsaved edits.
- `Ctrl+S` on an untitled file opens the native save dialog.
- Canceling the dialog keeps the untitled dirty working copy.
- Saving into notes refreshes and selects the new note.
- Saving outside notes writes the file without adding it to the notes tree.
- Existing inline notes creation still creates a notes-local file immediately.
- Existing `Ctrl+S` for normal notes still saves through `writeNote`.
- Closing the app with dirty working copies warns once.

Automated tests should focus on pure helpers where practical:

- working-copy id creation
- dirty calculation
- active-root containment and relative-path conversion
- save target classification: notes-local versus external

## Open Implementation Notes

The first implementation should be incremental:

1. Introduce the working-copy types and helper functions.
2. Route existing note selection through working-copy activation.
3. Add `Ctrl+N` untitled creation.
4. Add Save As for untitled files.
5. Add external-file saving.
6. Add close warning for dirty working copies.
7. Keep existing inline file creation working.

Avoid broad refactors of `MarkdownEditor`, `MarkdownPreview`, or the Rust notes path safety functions.
