# Untitled Working Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement VS Code-like untitled working copies so `Ctrl+N` opens an unsaved blank document and `Ctrl+S` saves it through a native Save As flow while preserving dirty state when switching files.

**Architecture:** Add a small TypeScript working-copy model around the existing editor state, then route file selection, tab rendering, dirty checks, and save actions through it. Add narrow Tauri APIs for Save As, notes-root path classification, and external-file writing without weakening existing notes-relative safety checks.

**Tech Stack:** React 19, TypeScript, Vite, Tauri 2, Rust, existing `src/lib/api.ts` invoke wrapper, existing `sonner` toasts.

---

## File Structure

- Modify `src/App.tsx`: own the working-copy state, wire `Ctrl+N`, `Ctrl+S`, tabs, file selection, dirty preservation, Save As, and close warning.
- Modify `src/components/layout/OpenTabsBar.tsx`: let file tabs use a stable `id` separate from notes-relative `path`, so untitled and external files can appear in the tab bar.
- Create `src/lib/workingCopies.ts`: pure TypeScript helpers and types for working-copy identity, dirty calculation, display names, and path classification inputs.
- Modify `src/lib/api.ts`: add invoke wrappers for native Save As, notes root, notes-relative conversion, and external Markdown writing.
- Modify `src-tauri/Cargo.toml`: add `tauri-plugin-dialog = "2"`.
- Modify `src-tauri/src/lib.rs`: register the dialog plugin and new commands.
- Modify `src-tauri/src/notes.rs`: add commands for notes-root path lookup, absolute path classification, and external Markdown writing; keep existing `safe_note_path` and `write_note` behavior unchanged.
- Modify `package.json` only if a frontend test runner is added. This plan does not add one; verification uses `pnpm build` and Rust tests.

---

### Task 1: Add Pure Working-Copy Types And Helpers

**Files:**
- Create: `src/lib/workingCopies.ts`
- Verify: `pnpm build`

- [ ] **Step 1: Create the working-copy helper module**

Create `src/lib/workingCopies.ts` with:

```ts
export type WorkingCopyKind = "note" | "external" | "untitled";

export interface WorkingCopySnapshot {
  pathKey: string | null;
  frontmatterPrefix: string;
  markdown: string;
}

export interface WorkingCopy {
  id: string;
  kind: WorkingCopyKind;
  path: string | null;
  absolutePath: string | null;
  displayName: string;
  frontmatterPrefix: string;
  markdown: string;
  savedSnapshot: WorkingCopySnapshot;
  dirty: boolean;
}

export interface WorkingCopyContent {
  frontmatterPrefix: string;
  markdown: string;
}

export function getNoteWorkingCopyId(relativePath: string): string {
  return `note:${relativePath}`;
}

export function getExternalWorkingCopyId(absolutePath: string): string {
  return `external:${absolutePath}`;
}

export function getUntitledWorkingCopyId(sequence: number): string {
  return `untitled:${sequence}`;
}

export function getWorkingCopyPathKey(copy: Pick<WorkingCopy, "kind" | "path" | "absolutePath">): string | null {
  if (copy.kind === "note") return copy.path ? getNoteWorkingCopyId(copy.path) : null;
  if (copy.kind === "external") return copy.absolutePath ? getExternalWorkingCopyId(copy.absolutePath) : null;
  return null;
}

export function isWorkingCopyDirty(
  snapshot: WorkingCopySnapshot,
  pathKey: string | null,
  content: WorkingCopyContent,
): boolean {
  return (
    snapshot.pathKey !== pathKey ||
    snapshot.frontmatterPrefix !== content.frontmatterPrefix ||
    snapshot.markdown !== content.markdown
  );
}

export function createUntitledWorkingCopy(sequence: number): WorkingCopy {
  const id = getUntitledWorkingCopyId(sequence);
  return {
    id,
    kind: "untitled",
    path: null,
    absolutePath: null,
    displayName: `Untitled-${sequence}`,
    frontmatterPrefix: "",
    markdown: "",
    savedSnapshot: {
      pathKey: null,
      frontmatterPrefix: "",
      markdown: "",
    },
    dirty: false,
  };
}

export function createNoteWorkingCopy(
  relativePath: string,
  displayName: string,
  content: WorkingCopyContent,
): WorkingCopy {
  const id = getNoteWorkingCopyId(relativePath);
  return {
    id,
    kind: "note",
    path: relativePath,
    absolutePath: null,
    displayName,
    frontmatterPrefix: content.frontmatterPrefix,
    markdown: content.markdown,
    savedSnapshot: {
      pathKey: id,
      frontmatterPrefix: content.frontmatterPrefix,
      markdown: content.markdown,
    },
    dirty: false,
  };
}

export function createExternalWorkingCopy(
  absolutePath: string,
  displayName: string,
  content: WorkingCopyContent,
): WorkingCopy {
  const id = getExternalWorkingCopyId(absolutePath);
  return {
    id,
    kind: "external",
    path: null,
    absolutePath,
    displayName,
    frontmatterPrefix: content.frontmatterPrefix,
    markdown: content.markdown,
    savedSnapshot: {
      pathKey: id,
      frontmatterPrefix: content.frontmatterPrefix,
      markdown: content.markdown,
    },
    dirty: false,
  };
}

export function updateWorkingCopyContent(copy: WorkingCopy, content: WorkingCopyContent): WorkingCopy {
  const pathKey = getWorkingCopyPathKey(copy);
  return {
    ...copy,
    frontmatterPrefix: content.frontmatterPrefix,
    markdown: content.markdown,
    dirty: isWorkingCopyDirty(copy.savedSnapshot, pathKey, content),
  };
}

export function markWorkingCopySaved(copy: WorkingCopy, content: WorkingCopyContent): WorkingCopy {
  const pathKey = getWorkingCopyPathKey(copy);
  return {
    ...copy,
    frontmatterPrefix: content.frontmatterPrefix,
    markdown: content.markdown,
    savedSnapshot: {
      pathKey,
      frontmatterPrefix: content.frontmatterPrefix,
      markdown: content.markdown,
    },
    dirty: false,
  };
}
```

- [ ] **Step 2: Run TypeScript build**

Run:

```bash
pnpm build
```

Expected: TypeScript may fail only if imports are not yet used because `noUnusedLocals` is strict. If it fails because the new file is not imported, continue to Task 3 where it is imported; do not weaken `tsconfig.json`.

- [ ] **Step 3: Commit**

Only commit if `pnpm build` passes at this point. Otherwise defer commit until Task 3.

```bash
git add -- src/lib/workingCopies.ts
git commit -m "feat: add working copy model"
```

---

### Task 2: Add Tauri Save-As And External File APIs

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/notes.rs`
- Modify: `src/lib/api.ts`
- Verify: `cargo test --manifest-path .\src-tauri\Cargo.toml` and `pnpm build`

- [ ] **Step 1: Add dialog plugin dependency**

In `src-tauri/Cargo.toml`, add this dependency next to the other Tauri plugins:

```toml
tauri-plugin-dialog = "2"
```

- [ ] **Step 2: Register the dialog plugin and commands**

In `src-tauri/src/lib.rs`, add the plugin before `tauri_plugin_opener::init()`:

```rust
.plugin(tauri_plugin_dialog::init())
.plugin(tauri_plugin_opener::init())
```

Add these commands to `tauri::generate_handler![...]` near existing notes commands:

```rust
notes::get_notes_root_path,
notes::classify_markdown_save_path,
notes::write_external_markdown_file,
```

- [ ] **Step 3: Add Rust command result type**

In `src-tauri/src/notes.rs`, add near the other public structs:

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownSavePathClassification {
    pub kind: String,
    pub relative_path: Option<String>,
    pub absolute_path: String,
}
```

Use `Serialize` from the file's existing serde imports. If the file only imports `Deserialize`, extend the import to:

```rust
use serde::{Deserialize, Serialize};
```

- [ ] **Step 4: Add path normalization helpers and commands**

In `src-tauri/src/notes.rs`, add these helpers below `validate_note_folder_path`:

```rust
fn normalize_absolute_path_text(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(|value| value.to_string())
        .ok_or_else(|| format!("Path contains non-UTF-8 characters: {path:?}"))
}

fn normalize_relative_path_text(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(|value| value.replace('\\', "/"))
        .ok_or_else(|| format!("Path contains non-UTF-8 characters: {path:?}"))
}
```

Add these commands near `read_note` and `write_note`:

```rust
#[tauri::command]
pub fn get_notes_root_path() -> Result<String, String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("Failed to create notes directory: {e}"))?;
    let canonical = notes_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve notes directory: {e}"))?;
    normalize_absolute_path_text(&canonical)
}

#[tauri::command]
pub fn classify_markdown_save_path(absolute_path: String) -> Result<MarkdownSavePathClassification, String> {
    let target = PathBuf::from(&absolute_path);
    if !target.is_absolute() {
        return Err("Save path must be absolute".to_string());
    }

    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("Failed to create notes directory: {e}"))?;
    let canonical_notes_dir = notes_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve notes directory: {e}"))?;

    let parent = target
        .parent()
        .ok_or_else(|| "Save path must have a parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("Failed to create save directory: {e}"))?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|e| format!("Failed to resolve save directory: {e}"))?;
    let file_name = target
        .file_name()
        .ok_or_else(|| "Save path must include a file name".to_string())?;
    let canonical_target = canonical_parent.join(file_name);
    let absolute_path = normalize_absolute_path_text(&canonical_target)?;

    if canonical_target.starts_with(&canonical_notes_dir) {
        let relative = canonical_target
            .strip_prefix(&canonical_notes_dir)
            .map_err(|_| "Failed to calculate notes-relative save path".to_string())?;
        let relative_path = validate_note_file_path(&normalize_relative_path_text(relative)?)?;
        return Ok(MarkdownSavePathClassification {
            kind: "note".to_string(),
            relative_path: Some(relative_path),
            absolute_path,
        });
    }

    Ok(MarkdownSavePathClassification {
        kind: "external".to_string(),
        relative_path: None,
        absolute_path,
    })
}

#[tauri::command]
pub fn write_external_markdown_file(absolute_path: String, content: String) -> Result<(), String> {
    let target = PathBuf::from(&absolute_path);
    if !target.is_absolute() {
        return Err("External save path must be absolute".to_string());
    }
    if target.extension().and_then(|ext| ext.to_str()) != Some("md") {
        return Err("External Markdown file must use the .md extension".to_string());
    }
    let parent = target
        .parent()
        .ok_or_else(|| "External save path must have a parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("Failed to create external file directory: {e}"))?;
    fs::write(&target, content.as_bytes())
        .map_err(|e| format!("Failed to write external Markdown file: {e}"))
}
```

- [ ] **Step 5: Add frontend API wrappers**

In `src/lib/api.ts`, add imports:

```ts
import { save } from "@tauri-apps/plugin-dialog";
```

Add interfaces and functions near note APIs:

```ts
export interface MarkdownSavePathClassification {
  kind: "note" | "external";
  relativePath: string | null;
  absolutePath: string;
}

export async function showSaveMarkdownDialog(defaultFileName: string): Promise<string | null> {
  const result = await save({
    title: "Save Markdown File",
    defaultPath: defaultFileName.endsWith(".md") ? defaultFileName : `${defaultFileName}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  return typeof result === "string" ? result : null;
}

export async function getNotesRootPath(): Promise<string> {
  try {
    return await invoke<string>("get_notes_root_path");
  } catch (e) {
    throw toError(e);
  }
}

export async function classifyMarkdownSavePath(absolutePath: string): Promise<MarkdownSavePathClassification> {
  try {
    return await invoke<MarkdownSavePathClassification>("classify_markdown_save_path", { absolutePath });
  } catch (e) {
    throw toError(e);
  }
}

export async function writeExternalMarkdownFile(absolutePath: string, content: string): Promise<void> {
  try {
    await invoke<void>("write_external_markdown_file", { absolutePath, content });
  } catch (e) {
    throw toError(e);
  }
}
```

- [ ] **Step 6: Run Rust tests**

Run:

```bash
cargo test --manifest-path .\src-tauri\Cargo.toml
```

Expected: PASS.

- [ ] **Step 7: Run frontend build**

Run:

```bash
pnpm build
```

Expected: PASS after the dialog dependency is installed in `node_modules`. If TypeScript reports `Cannot find module '@tauri-apps/plugin-dialog'`, run `pnpm add @tauri-apps/plugin-dialog@^2` and commit the resulting `package.json` and lockfile changes.

- [ ] **Step 8: Print changed files**

Run:

```bash
Get-Content -Raw src-tauri/Cargo.toml
Get-Content -Raw src-tauri/src/lib.rs
Get-Content -Raw src-tauri/src/notes.rs
Get-Content -Raw src/lib/api.ts
```

- [ ] **Step 9: Commit**

```bash
git add -- src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/notes.rs src/lib/api.ts package.json pnpm-lock.yaml
git diff --cached --name-only
git commit -m "feat: add markdown save target APIs"
```

If `pnpm-lock.yaml` does not exist or was not changed, omit it from `git add`.

---

### Task 3: Wire Working Copies Into Existing Editor State

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/OpenTabsBar.tsx`
- Verify: `pnpm build`

- [ ] **Step 1: Import working-copy helpers and new APIs**

In `src/App.tsx`, extend imports from `@/lib/api` with:

```ts
classifyMarkdownSavePath,
showSaveMarkdownDialog,
writeExternalMarkdownFile,
```

Add imports from `@/lib/workingCopies`:

```ts
import {
  createExternalWorkingCopy,
  createNoteWorkingCopy,
  createUntitledWorkingCopy,
  getNoteWorkingCopyId,
  markWorkingCopySaved,
  updateWorkingCopyContent,
  type WorkingCopy,
} from "@/lib/workingCopies";
```

- [ ] **Step 2: Extend tab types**

In `src/components/layout/OpenTabsBar.tsx`, change `OpenFileTab` to:

```ts
export interface OpenFileTab {
  kind: "file";
  id: string;
  path: string | null;
  title?: string;
  displayName: string;
  dirty?: boolean;
  externalPath?: string | null;
}
```

Change tab id resolution:

```ts
const tabId = tab.kind === "file" ? tab.id : tab.id;
```

Change tooltip:

```ts
const tooltip = tab.kind === "file" ? (tab.path ?? tab.externalPath ?? tab.displayName) : `${tab.title}: ${tab.sourcePath}`;
```

- [ ] **Step 3: Add App working-copy state**

In `App`, near `currentFilePath` and `openTabPaths`, add:

```ts
const [workingCopies, setWorkingCopies] = useState<Record<string, WorkingCopy>>({});
const [activeWorkingCopyId, setActiveWorkingCopyId] = useState<string | null>(null);
const untitledSequenceRef = useRef(0);
```

- [ ] **Step 4: Add live editor snapshot helper**

Near `getLiveFullMarkdown`, add:

```ts
const getLiveWorkingCopyContent = useCallback(() => ({
  frontmatterPrefix,
  markdown: markdownLiveRef.current,
}), [frontmatterPrefix]);
```

- [ ] **Step 5: Add persist-active helper**

Add this callback near `applyLoadedMarkdown`:

```ts
const persistActiveWorkingCopy = useCallback(() => {
  if (!activeWorkingCopyId) return;
  const content = getLiveWorkingCopyContent();
  setWorkingCopies((current) => {
    const active = current[activeWorkingCopyId];
    if (!active) return current;
    return {
      ...current,
      [activeWorkingCopyId]: updateWorkingCopyContent(active, content),
    };
  });
}, [activeWorkingCopyId, getLiveWorkingCopyContent]);
```

- [ ] **Step 6: Update editor change dirty calculation**

In `handleMarkdownChange`, after `markdownLiveRef.current = value`, update the active working copy:

```ts
if (activeWorkingCopyId) {
  setWorkingCopies((current) => {
    const active = current[activeWorkingCopyId];
    if (!active) return current;
    return {
      ...current,
      [activeWorkingCopyId]: updateWorkingCopyContent(active, {
        frontmatterPrefix,
        markdown: value,
      }),
    };
  });
}
```

Keep the existing `setIsDirty(nextDirty)` compatibility path for notes while this task is being integrated.

- [ ] **Step 7: Load existing working copy instead of discarding dirty state**

Replace the dirty check in `handleSelectFile` with:

```ts
persistActiveWorkingCopy();
finishFileSelection(path, options?.closeSearchOnSuccess ?? false);
return true;
```

This removes the old prompt-on-switch behavior.

- [ ] **Step 8: Activate note working copies after file load**

In the `readNote(currentFilePath).then(...)` block, after `applyLoadedMarkdown(content, currentFilePath)`, create or reuse a note working copy:

```ts
const loaded = splitFrontmatterForEditor(content);
const id = getNoteWorkingCopyId(currentFilePath);
setWorkingCopies((current) => {
  if (current[id]) return current;
  return {
    ...current,
    [id]: createNoteWorkingCopy(currentFilePath, getNoteDisplayName(currentFilePath, displayFiles), {
      frontmatterPrefix: loaded.frontmatterPrefix,
      markdown: loaded.body,
    }),
  };
});
setActiveWorkingCopyId(id);
```

Before reading from disk, if `workingCopies[getNoteWorkingCopyId(currentFilePath)]` exists, apply that cached content instead:

```ts
const cached = workingCopies[getNoteWorkingCopyId(currentFilePath)];
if (cached) {
  replaceEditorDocument(cached.markdown, cached.path, cached.frontmatterPrefix);
  setIsDirty(cached.dirty);
  isDirtyRef.current = cached.dirty;
  setActiveWorkingCopyId(cached.id);
  return;
}
```

Add `workingCopies` and `displayFiles` to this effect's dependency array.

- [ ] **Step 9: Render tabs from working copies**

Change `openTabs` to combine notes tabs and active untitled/external working copies:

```ts
const workingCopyTabs = Object.values(workingCopies)
  .filter((copy) => copy.kind !== "note" || openTabPaths.includes(copy.path ?? ""))
  .map((copy): OpenFileTab => ({
    kind: "file",
    id: copy.id,
    path: copy.path,
    externalPath: copy.absolutePath,
    displayName: copy.kind === "note" && copy.path ? getNoteDisplayName(copy.path, displayFiles) : copy.displayName,
    dirty: copy.dirty,
  }));
```

Use `workingCopyTabs` as the file-tab portion of `tabs`.

- [ ] **Step 10: Select tabs by working-copy id**

In `handleSelectOpenTab`, for file tabs:

```ts
if (tab.path) {
  handleSelectFile(tab.path);
  return;
}
const copy = workingCopies[tab.id];
if (!copy) return;
persistActiveWorkingCopy();
setActiveWorkingCopyId(copy.id);
setCurrentFilePath(copy.path);
replaceEditorDocument(copy.markdown, copy.path, copy.frontmatterPrefix);
setIsDirty(copy.dirty);
isDirtyRef.current = copy.dirty;
setActiveWorkspaceTabId(copy.id);
```

- [ ] **Step 11: Run build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 12: Print changed files**

Run:

```bash
Get-Content -Raw src/App.tsx
Get-Content -Raw src/components/layout/OpenTabsBar.tsx
```

- [ ] **Step 13: Commit**

```bash
git add -- src/App.tsx src/components/layout/OpenTabsBar.tsx src/lib/workingCopies.ts
git diff --cached --name-only
git commit -m "feat: preserve editor working copies"
```

---

### Task 4: Implement Ctrl+N Untitled Creation

**Files:**
- Modify: `src/App.tsx`
- Verify: `pnpm build`

- [ ] **Step 1: Add create-untitled callback**

In `App`, add:

```ts
const createUntitledEditor = useCallback(() => {
  persistActiveWorkingCopy();
  untitledSequenceRef.current += 1;
  const copy = createUntitledWorkingCopy(untitledSequenceRef.current);
  setWorkingCopies((current) => ({
    ...current,
    [copy.id]: copy,
  }));
  setActiveWorkingCopyId(copy.id);
  setCurrentFilePath(null);
  setActiveTreeDirectoryPath(null);
  setActiveTreeFilePath(null);
  setActiveWorkspaceTabId(copy.id);
  replaceEditorDocument("", null, "");
  setIsDirty(false);
  isDirtyRef.current = false;
}, [persistActiveWorkingCopy]);
```

- [ ] **Step 2: Change Ctrl+N handler**

Replace the global `Ctrl+N` action:

```ts
requestInlineCreateFile();
```

with:

```ts
createUntitledEditor();
```

Keep sidebar file-plus button on `requestInlineCreateFile` so inline notes creation remains available.

- [ ] **Step 3: Run build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 4: Print changed file**

Run:

```bash
Get-Content -Raw src/App.tsx
```

- [ ] **Step 5: Commit**

```bash
git add -- src/App.tsx
git diff --cached --name-only
git commit -m "feat: create untitled editor with ctrl n"
```

---

### Task 5: Implement Save And Save As For Working Copies

**Files:**
- Modify: `src/App.tsx`
- Verify: `pnpm build`

- [ ] **Step 1: Add save result helper**

Near `showSavedToast`, add:

```ts
const getUntitledSaveDefaultName = (copy: WorkingCopy): string => {
  const base = copy.displayName.trim() || "Untitled";
  return base.toLowerCase().endsWith(".md") ? base : `${base}.md`;
};
```

- [ ] **Step 2: Split current save logic**

Refactor `handleSaveCurrentNote` so it checks `activeWorkingCopyId` first:

```ts
const handleSaveCurrentNote = async () => {
  const activeCopy = activeWorkingCopyId ? workingCopies[activeWorkingCopyId] : null;
  const liveMarkdown = markdownLiveRef.current;
  const liveFullMarkdown = getLiveFullMarkdown();
  flushCommittedMarkdownSync();

  if (!activeCopy && currentFilePath === null) {
    toast.info("Open or create a file before saving");
    return;
  }

  setIsSavingNote(true);
  try {
    if (activeCopy?.kind === "untitled") {
      const selectedPath = await showSaveMarkdownDialog(getUntitledSaveDefaultName(activeCopy));
      if (!selectedPath) return;
      const classification = await classifyMarkdownSavePath(selectedPath);
      if (classification.kind === "note" && classification.relativePath) {
        const warning = await writeNote(classification.relativePath, liveFullMarkdown);
        const updated = await listNotes();
        const savedContent = await readNote(classification.relativePath);
        const loaded = splitFrontmatterForEditor(savedContent);
        const nextCopy = markWorkingCopySaved(
          createNoteWorkingCopy(classification.relativePath, getNoteDisplayName(classification.relativePath, updated), {
            frontmatterPrefix: loaded.frontmatterPrefix,
            markdown: loaded.body,
          }),
          { frontmatterPrefix: loaded.frontmatterPrefix, markdown: loaded.body },
        );
        setFiles(updated);
        setWorkingCopies((current) => {
          const next = { ...current };
          delete next[activeCopy.id];
          next[nextCopy.id] = nextCopy;
          return next;
        });
        setActiveWorkingCopyId(nextCopy.id);
        setCurrentFilePath(classification.relativePath);
        setActiveWorkspaceTabId(nextCopy.id);
        setActiveTreeFilePath(classification.relativePath);
        setIsDirty(false);
        isDirtyRef.current = false;
        applyLoadedMarkdown(savedContent, classification.relativePath);
        showSavedToast("Saved", warning);
        return;
      }

      await writeExternalMarkdownFile(classification.absolutePath, liveFullMarkdown);
      const displayName = classification.absolutePath.replace(/\\/g, "/").split("/").pop() ?? activeCopy.displayName;
      const nextCopy = markWorkingCopySaved(
        createExternalWorkingCopy(classification.absolutePath, displayName, {
          frontmatterPrefix,
          markdown: liveMarkdown,
        }),
        { frontmatterPrefix, markdown: liveMarkdown },
      );
      setWorkingCopies((current) => {
        const next = { ...current };
        delete next[activeCopy.id];
        next[nextCopy.id] = nextCopy;
        return next;
      });
      setActiveWorkingCopyId(nextCopy.id);
      setActiveWorkspaceTabId(nextCopy.id);
      setIsDirty(false);
      isDirtyRef.current = false;
      toast.success("Saved");
      return;
    }

    if (activeCopy?.kind === "external" && activeCopy.absolutePath) {
      await writeExternalMarkdownFile(activeCopy.absolutePath, liveFullMarkdown);
      const savedCopy = markWorkingCopySaved(activeCopy, { frontmatterPrefix, markdown: liveMarkdown });
      setWorkingCopies((current) => ({ ...current, [savedCopy.id]: savedCopy }));
      setIsDirty(false);
      isDirtyRef.current = false;
      toast.success("Saved");
      return;
    }

    if (currentFilePath === null) {
      toast.info("Open or create a file before saving");
      return;
    }

    const warning = await writeNote(currentFilePath, liveFullMarkdown);
    const savedContent = await readNote(currentFilePath);
    applyLoadedMarkdown(savedContent, currentFilePath);
    const loaded = splitFrontmatterForEditor(savedContent);
    const id = getNoteWorkingCopyId(currentFilePath);
    setWorkingCopies((current) => {
      const existing = current[id] ?? createNoteWorkingCopy(currentFilePath, getNoteDisplayName(currentFilePath, displayFiles), loaded);
      return {
        ...current,
        [id]: markWorkingCopySaved(existing, {
          frontmatterPrefix: loaded.frontmatterPrefix,
          markdown: loaded.body,
        }),
      };
    });
    showSavedToast("Saved", warning);
    setIsDirty(false);
    isDirtyRef.current = false;
  } catch (err) {
    toast.error(`Save failed: ${getErrorMessage(err)}`);
  } finally {
    setIsSavingNote(false);
  }
};
```

Adapt the Chinese strings to the file's existing encoding style if nearby strings are already readable in the editor.

- [ ] **Step 3: Enable status save button for untitled files**

Change disabled/title logic so the status save button is enabled when:

```ts
const canSaveActiveWorkingCopy = Boolean(activeWorkingCopyId && workingCopies[activeWorkingCopyId]);
```

Use it in button disabled logic:

```tsx
disabled={!canSaveActiveWorkingCopy || isSavingNote}
```

Keep the dirty visual style only when the active copy is dirty.

- [ ] **Step 4: Run build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Print changed file**

Run:

```bash
Get-Content -Raw src/App.tsx
```

- [ ] **Step 6: Commit**

```bash
git add -- src/App.tsx
git diff --cached --name-only
git commit -m "feat: save untitled working copies"
```

---

### Task 6: Add Dirty Close Warning

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/App.tsx`
- Modify: `src/lib/api.ts`
- Verify: `pnpm build` and `cargo test --manifest-path .\src-tauri\Cargo.toml`

- [ ] **Step 1: Add close command in Rust**

In `src-tauri/src/lib.rs`, add:

```rust
#[tauri::command]
fn hide_main_window(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| format!("Failed to hide main window: {e}"))
}
```

Register it in `generate_handler![...]`:

```rust
hide_main_window,
```

Keep the existing `CloseRequested` prevention as-is.

- [ ] **Step 2: Add frontend wrapper**

In `src/lib/api.ts`, add:

```ts
export async function hideMainWindow(): Promise<void> {
  try {
    await invoke<void>("hide_main_window");
  } catch (e) {
    throw toError(e);
  }
}
```

- [ ] **Step 3: Listen for close request in App**

In `src/App.tsx`, import `hideMainWindow`.

Add a derived value:

```ts
const hasDirtyWorkingCopies = useMemo(
  () => Object.values(workingCopies).some((copy) => copy.dirty),
  [workingCopies],
);
```

Add an effect:

```ts
useEffect(() => {
  let disposed = false;
  let unlisten: (() => void) | null = null;

  listen("tauri://close-requested", async () => {
    if (disposed) return;
    persistActiveWorkingCopy();
    if (hasDirtyWorkingCopies) {
      const ok = await requestConfirm({
        title: "Unsaved files",
        description: "Closing the window keeps the app running in the tray, but unsaved edits only live in the current session.",
        confirmText: "Close Window",
        danger: true,
      });
      if (!ok) return;
    }
    await hideMainWindow();
  })
    .then((dispose) => {
      unlisten = dispose;
    })
    .catch((e: Error) => console.error("注册关闭监听失败：", e.message));

  return () => {
    disposed = true;
    unlisten?.();
  };
}, [hasDirtyWorkingCopies, persistActiveWorkingCopy, requestConfirm]);
```

If Tauri does not emit `tauri://close-requested` to the frontend in this project, change the Rust close handler to emit a custom event before `prevent_close()`:

```rust
let _ = window.emit("main-close-requested", ());
```

Then listen for `"main-close-requested"` instead.

- [ ] **Step 4: Run build and Rust tests**

Run:

```bash
pnpm build
cargo test --manifest-path .\src-tauri\Cargo.toml
```

Expected: PASS.

- [ ] **Step 5: Print changed files**

Run:

```bash
Get-Content -Raw src/App.tsx
Get-Content -Raw src/lib/api.ts
Get-Content -Raw src-tauri/src/lib.rs
```

- [ ] **Step 6: Commit**

```bash
git add -- src/App.tsx src/lib/api.ts src-tauri/src/lib.rs
git diff --cached --name-only
git commit -m "feat: warn before closing dirty working copies"
```

---

### Task 7: Manual Verification In The App

**Files:**
- No planned edits unless verification finds a bug.
- Verify: `pnpm tauri dev`

- [ ] **Step 1: Start the app**

Run:

```bash
pnpm tauri dev
```

Expected: the desktop app opens.

- [ ] **Step 2: Verify Ctrl+N creates untitled**

In the app:

1. Press `Ctrl+N`.
2. Confirm the editor is blank.
3. Confirm the tab/status display shows `Untitled-1`.
4. Confirm no new file appears in the notes tree.

- [ ] **Step 3: Verify dirty state survives switching**

In the app:

1. Open an existing notes file.
2. Type a unique unsaved line.
3. Press `Ctrl+N`.
4. Select the original notes file in the tree.
5. Confirm the unique unsaved line is still in the editor and the tab is dirty.

- [ ] **Step 4: Verify Save As cancel**

In the app:

1. Press `Ctrl+N`.
2. Type `cancel test`.
3. Press `Ctrl+S`.
4. Cancel the save dialog.
5. Confirm the tab remains untitled and dirty.

- [ ] **Step 5: Verify Save As into notes**

In the app:

1. Press `Ctrl+N`.
2. Type `notes save test`.
3. Press `Ctrl+S`.
4. Save as `notes/manual-untitled-test.md` under the project notes root.
5. Confirm the file appears in the notes tree.
6. Confirm it is selected as the current note.
7. Confirm the dirty indicator clears.

- [ ] **Step 6: Verify Save As outside notes**

In the app:

1. Press `Ctrl+N`.
2. Type `external save test`.
3. Press `Ctrl+S`.
4. Save to a temporary folder outside the notes root as `external-save-test.md`.
5. Confirm no new file appears in the notes tree.
6. Confirm the tab display name becomes `external-save-test.md`.
7. Confirm pressing `Ctrl+S` again saves without reopening the dialog.

- [ ] **Step 7: Verify existing inline creation**

In the app:

1. Click the notes sidebar file-plus button.
2. Create a named notes file.
3. Confirm it appears immediately in the tree and opens as a normal notes file.

- [ ] **Step 8: Verify close warning**

In the app:

1. Create or edit a dirty working copy.
2. Close the main window.
3. Confirm the app prompts about unsaved files.
4. Cancel and confirm the window remains usable.
5. Close again and confirm accepting hides the main window.

- [ ] **Step 9: Stop dev server**

Stop `pnpm tauri dev` with `Ctrl+C`.

- [ ] **Step 10: Fix verification bugs if found**

For each bug, make the smallest code change, then run:

```bash
pnpm build
cargo test --manifest-path .\src-tauri\Cargo.toml
```

Expected: PASS.

- [ ] **Step 11: Commit verification fixes**

Only if edits were made:

```bash
git add -- src/App.tsx src/components/layout/OpenTabsBar.tsx src/lib/api.ts src/lib/workingCopies.ts src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/notes.rs package.json pnpm-lock.yaml
git diff --cached --name-only
git commit -m "fix: polish untitled working copy flow"
```

Omit any path in that command that was not changed.

---

## Final Verification

- [ ] Run:

```bash
pnpm build
cargo test --manifest-path .\src-tauri\Cargo.toml
git status --short -- . ":(exclude)notes/**"
```

- [ ] Expected:

```text
pnpm build exits 0
cargo test exits 0
git status shows only intentional changes or is clean, excluding notes/**
```

- [ ] Do not stage or modify `notes/**`.

---

## Self-Review Notes

- Spec coverage: Tasks cover working-copy model, `Ctrl+N`, `Ctrl+S`, Save As into notes, external saves, preserving dirty state while switching, close warning, and retaining inline notes creation.
- Placeholder scan: No `TBD`/`TODO` placeholders remain; any conditional branches include exact fallback instructions.
- Type consistency: `WorkingCopy`, `OpenFileTab.id`, and API wrapper names are consistent across tasks.
