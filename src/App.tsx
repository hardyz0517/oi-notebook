import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bot, Download, ExternalLink, PlugZap, Plus, RefreshCw, RotateCcw, Settings, Upload } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MarkdownEditor from "@/components/editor/MarkdownEditor";
import MarkdownPreview from "@/components/editor/MarkdownPreview";
import FileTree from "@/components/file-tree/FileTree";
import { listNotes, readNote, writeNote, commitNote, commitDeletedNote, commitRenamedNote, pushGit, deleteNote, renameNote, openBlog, restartBlogServer, saveNoteAsset, importLuoguInsight, getLuoguConfig, saveLuoguConfig, testLuoguConnection, syncLuoguInsights, getAiConfig, saveAiConfig, testAiConnection } from "@/lib/api";
import type { SyncLuoguInsightsResult, TestAiConnectionResult, TestLuoguConnectionResult } from "@/lib/api";
import { mergeFrontmatterFields, parseFrontmatterFields } from "@/lib/frontmatter";
import type { FrontmatterFields } from "@/lib/frontmatter";
import type { NoteFileInfo } from "@/types/note";

// 欢迎内容：未选中文件时在编辑器和预览里显示
const INITIAL_MARKDOWN = `# OI Notebook 欢迎使用

## 这是什么？

**OI Notebook** 是一个专为竞赛选手设计的本地笔记工具。你可以在左侧编辑 *Markdown*，右侧实时预览渲染结果。支持 \`LaTeX\` 数学公式和代码语法高亮。

## 功能一览

- 支持 **GitHub Flavored Markdown**（表格、任务列表、删除线）
- 支持 $\\LaTeX$ 行内公式和块级公式
- 代码块语法高亮（由 Shiki 驱动）
- 深色主题，护眼适合长时间刷题

## 快速幂模板

下面是一段常用的快速幂代码（$O(\\log n)$ 时间复杂度）：

\`\`\`cpp
// 快速幂：计算 base^exp % mod
long long qpow(long long base, long long exp, long long mod) {
    long long result = 1;
    base %= mod;
    while (exp > 0) {
        if (exp & 1) result = result * base % mod;
        base = base * base % mod;
        exp >>= 1;
    }
    return result;
}
\`\`\`

## 数学公式

费马小定理：若 $p$ 是质数且 $\\gcd(a, p) = 1$，则

$$
a^{p-1} \\equiv 1 \\pmod{p}
$$

因此 $a$ 在模 $p$ 意义下的逆元为 $a^{p-2} \\bmod p$，可用快速幂 $O(\\log p)$ 求出。

## 常用复杂度速查

| 算法 | 时间复杂度 |
|------|-----------|
| 快速排序（平均） | $O(n \\log n)$ |
| 线段树单点修改 | $O(\\log n)$ |
| Dijkstra（堆优化） | $O((V + E) \\log V)$ |

## 学习建议

1. 先把基础数据结构（线段树、树状数组）打扎实
2. 图论专题：最短路、最小生成树、强连通分量
3. 动态规划：背包、区间 DP、树形 DP
4. 数学：快速幂、逆元、组合数、莫比乌斯反演

> 刷题不在多，在精。每道题都要弄懂为什么对、为什么错，而不是只追 AC 数量。
`;

type NewNoteDirectory = "tricks" | "problems";
type NoteTemplateId = "blank" | "trick" | "solution";

function getDefaultTemplateForDirectory(directory: NewNoteDirectory): NoteTemplateId {
  return directory === "tricks" ? "trick" : "solution";
}

function quoteYamlString(value: string): string {
  return JSON.stringify(value);
}

function buildNoteTemplate(templateId: NoteTemplateId, title: string): string {
  if (templateId === "blank") return "";

  const quotedTitle = quoteYamlString(title);
  const frontmatter = `---\ntitle: ${quotedTitle}\ntags: []\ndifficulty: ""\nsource: ""\nsummary: ""\ndraft: false\n---`;

  if (templateId === "trick") {
    return `${frontmatter}\n\n## 结论\n\n\n## 适用条件\n\n\n## 例子\n\n\n## 代码\n\n\`\`\`cpp\n\n\`\`\`\n`;
  }

  return `${frontmatter}\n\n## 题意\n\n\n## 思路\n\n\n## 证明\n\n\n## 代码\n\n\`\`\`cpp\n\n\`\`\`\n\n## 复杂度\n\n\n`;
}

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function App() {
  const [files, setFiles] = useState<NoteFileInfo[]>([]);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  // null 时显示欢迎内容，选中文件后显示文件实际内容
  const [markdown, setMarkdown] = useState(INITIAL_MARKDOWN);
  // undefined 表示未发生过滚动（初次挂载跳过预览同步）
  const [scrollRatio, setScrollRatio] = useState<number | undefined>(undefined);
  const [isDirty, setIsDirty] = useState(false);
  const [dialogMode, setDialogMode] = useState<null | "create" | "rename">(null);
  const [dialogValue, setDialogValue] = useState("");
  const [newNoteDirectory, setNewNoteDirectory] = useState<NewNoteDirectory>("tricks");
  const [newNoteTemplate, setNewNoteTemplate] = useState<NoteTemplateId>("trick");
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [isRestartingBlog, setIsRestartingBlog] = useState(false);
  const [isPushingGit, setIsPushingGit] = useState(false);
  const [isLuoguDialogOpen, setIsLuoguDialogOpen] = useState(false);
  const [isLuoguSettingsOpen, setIsLuoguSettingsOpen] = useState(false);
  const [isLoadingLuoguConfig, setIsLoadingLuoguConfig] = useState(false);
  const [isSavingLuoguConfig, setIsSavingLuoguConfig] = useState(false);
  const [isTestingLuoguConnection, setIsTestingLuoguConnection] = useState(false);
  const [luoguConnectionResult, setLuoguConnectionResult] = useState<TestLuoguConnectionResult | null>(null);
  const [isSyncingLuogu, setIsSyncingLuogu] = useState(false);
  const [luoguSyncResult, setLuoguSyncResult] = useState<SyncLuoguInsightsResult | null>(null);
  const [luoguConfigUid, setLuoguConfigUid] = useState("");
  const [luoguConfigClientId, setLuoguConfigClientId] = useState("");
  const [luoguConfigLastSubmissionId, setLuoguConfigLastSubmissionId] = useState("");
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [isLoadingAiConfig, setIsLoadingAiConfig] = useState(false);
  const [isSavingAiConfig, setIsSavingAiConfig] = useState(false);
  const [isTestingAiConnection, setIsTestingAiConnection] = useState(false);
  const [aiConnectionResult, setAiConnectionResult] = useState<TestAiConnectionResult | null>(null);
  const [aiConfigBaseUrl, setAiConfigBaseUrl] = useState("");
  const [aiConfigApiKey, setAiConfigApiKey] = useState("");
  const [aiConfigModel, setAiConfigModel] = useState("");
  const [isImportingLuogu, setIsImportingLuogu] = useState(false);
  const [luoguProblemId, setLuoguProblemId] = useState("");
  const [luoguProblemTitle, setLuoguProblemTitle] = useState("");
  const [luoguSubmissionId, setLuoguSubmissionId] = useState("");
  const [luoguSourceCode, setLuoguSourceCode] = useState("");
  const [pendingAssetsByFile, setPendingAssetsByFile] = useState<Record<string, string[]>>({});
  const frontmatter = useMemo(() => parseFrontmatterFields(markdown), [markdown]);

  function validateFilename(name: string): string | null {
    const trimmed = name.trim();
    if (!trimmed) return "文件名不能为空";
    // TODO(后续 Phase): 支持跨目录重命名（拖拽或对话框选目标目录）
    if (trimmed.includes("/") || trimmed.includes("\\")) return "文件名不能包含路径分隔符";
    if (trimmed.includes("..")) return "文件名不能包含 ..";
    if (trimmed.toLowerCase().endsWith(".md")) return "不需要输入 .md 后缀";
    return null;
  }

  const openCreateDialog = () => {
    setDialogMode("create");
    setDialogValue("");
    setNewNoteDirectory("tricks");
    setNewNoteTemplate(getDefaultTemplateForDirectory("tricks"));
  };

  const openRenameDialog = (path: string) => {
    // 提取纯文件名（不含目录前缀），如 "inbox/quick-xxx.md" → "quick-xxx"
    const filename = path.split("/").pop() ?? path;
    const baseName = filename.replace(/\.md$/i, "");
    setDialogMode("rename");
    setDialogValue(baseName);
    setRenameTarget(path);
  };

  const closeDialog = () => {
    setDialogMode(null);
    setDialogValue("");
    setNewNoteDirectory("tricks");
    setNewNoteTemplate(getDefaultTemplateForDirectory("tricks"));
    setRenameTarget(null);
  };

  const updateNewNoteDirectory = (directory: NewNoteDirectory) => {
    setNewNoteDirectory(directory);
    setNewNoteTemplate(getDefaultTemplateForDirectory(directory));
  };

  const handleCreate = async () => {
    const err = validateFilename(dialogValue);
    if (err) { toast.error(err); return; }
    const newPath = `${newNoteDirectory}/${dialogValue.trim()}.md`;
    if (files.some((f) => f.path === newPath)) { toast.error("文件名已存在"); return; }
    // dirty 检查必须在创建文件之前——避免用户取消后留下孤儿文件
    if (isDirty) {
      const ok = window.confirm("当前笔记有未保存的改动，新建会切换走，未保存的改动将丢失。确定吗？");
      if (!ok) return;
    }
    try {
      const templateMarkdown = buildNoteTemplate(newNoteTemplate, dialogValue.trim());
      await writeNote(newPath, templateMarkdown);
      const updated = await listNotes();
      setFiles(updated);
      closeDialog();
      setCurrentFilePath(newPath);
      toast.success("已创建");
    } catch (e) {
      toast.error(`创建失败: ${e}`);
    }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const err = validateFilename(dialogValue);
    if (err) { toast.error(err); return; }
    // 保留原目录前缀，如 "inbox/quick-xxx.md" → "inbox/new-name.md"
    const lastSlashIdx = renameTarget.lastIndexOf("/");
    const dirPrefix = lastSlashIdx === -1 ? "" : renameTarget.slice(0, lastSlashIdx + 1);
    const newPath = `${dirPrefix}${dialogValue.trim()}.md`;
    if (newPath === renameTarget) { closeDialog(); return; }
    if (files.some((f) => f.path === newPath)) { toast.error("文件名已存在"); return; }
    if (renameTarget === currentFilePath && isDirty) {
      const ok = window.confirm("当前笔记有未保存的改动，重命名前请先保存。确定继续吗？未保存的改动将丢失。");
      if (!ok) return;
    }
    try {
      await renameNote(renameTarget, newPath);
      try {
        await commitRenamedNote(renameTarget, newPath);
        toast.success("已重命名并提交");
      } catch (commitError) {
        toast.warning(`重命名成功，Git 提交失败：${commitError}`);
      }
      const updated = await listNotes();
      setFiles(updated);
      if (renameTarget === currentFilePath) {
        setCurrentFilePath(newPath);
        setIsDirty(false);
      }
      closeDialog();
    } catch (e) {
      toast.error(`重命名失败: ${e}`);
    }
  };

  const handleDelete = async (path: string) => {
    const ok = window.confirm(`确定删除"${path}"吗？此操作不可撤销。`);
    if (!ok) return;
    try {
      await deleteNote(path);
      try {
        const commitStatus = await commitDeletedNote(path);
        if (commitStatus === "committed") {
          toast.success("已删除并提交");
        } else {
          toast.success("已删除");
        }
      } catch (commitError) {
        toast.warning(`删除成功，Git 提交失败：${commitError}`);
      }
      const updated = await listNotes();
      setFiles(updated);
      if (path === currentFilePath) {
        setCurrentFilePath(null);
        setIsDirty(false);
      }
    } catch (e) {
      toast.error(`删除失败: ${e}`);
    }
  };

  const handleDialogConfirm = () => {
    if (dialogMode === "create") handleCreate();
    else if (dialogMode === "rename") handleRename();
  };

  const handleOpenBlog = async () => {
    try {
      await openBlog();
    } catch (e) {
      toast.error(`打开博客失败: ${e}`);
    }
  };

  const handleRestartBlog = async () => {
    setIsRestartingBlog(true);
    try {
      await restartBlogServer();
      toast.success("博客已重启");
    } catch (e) {
      toast.error(`重启博客失败: ${e}`);
    } finally {
      setIsRestartingBlog(false);
    }
  };

  const handlePushGit = async () => {
    setIsPushingGit(true);
    try {
      await pushGit();
      toast.success("Git 已同步");
    } catch (e) {
      toast.error(`Git 同步失败：${e}`);
    } finally {
      setIsPushingGit(false);
    }
  };

  const openLuoguSettings = async () => {
    setIsLuoguSettingsOpen(true);
    setIsLoadingLuoguConfig(true);
    try {
      const config = await getLuoguConfig();
      setLuoguConfigUid(config.luogu.uid);
      setLuoguConfigClientId(config.luogu.client_id);
      setLuoguConfigLastSubmissionId(
        config.luogu.last_submission_id === null ? "" : String(config.luogu.last_submission_id),
      );
    } catch (e) {
      toast.error(`洛谷配置读取失败：${e}`);
    } finally {
      setIsLoadingLuoguConfig(false);
    }
  };

  const closeLuoguSettings = () => {
    if (isSavingLuoguConfig) return;
    setIsLuoguSettingsOpen(false);
  };

  const handleSaveLuoguConfig = async () => {
    const lastSubmissionId = luoguConfigLastSubmissionId.trim();
    const parsedLastSubmissionId =
      lastSubmissionId === "" ? null : Number(lastSubmissionId);
    if (
      parsedLastSubmissionId !== null &&
      (!Number.isInteger(parsedLastSubmissionId) || parsedLastSubmissionId < 0)
    ) {
      toast.error("last_submission_id 必须是非负整数或留空");
      return;
    }

    setIsSavingLuoguConfig(true);
    try {
      await saveLuoguConfig({
        luogu: {
          uid: luoguConfigUid.trim(),
          client_id: luoguConfigClientId.trim(),
          last_submission_id: parsedLastSubmissionId,
        },
      });
      toast.success("洛谷配置已保存");
      setIsLuoguSettingsOpen(false);
    } catch (e) {
      toast.error(`洛谷配置保存失败：${e}`);
    } finally {
      setIsSavingLuoguConfig(false);
    }
  };

  const handleTestLuoguConnection = async () => {
    setIsTestingLuoguConnection(true);
    setLuoguConnectionResult(null);
    try {
      const result = await testLuoguConnection();
      setLuoguConnectionResult(result);
      toast.success(`洛谷连接正常，拉到 ${result.fetchedCount} 条提交`);
    } catch (e) {
      toast.error(`洛谷连接测试失败：${getErrorMessage(e)}`);
    } finally {
      setIsTestingLuoguConnection(false);
    }
  };

  const openAiSettings = async () => {
    setIsAiSettingsOpen(true);
    setIsLoadingAiConfig(true);
    setAiConnectionResult(null);
    try {
      const config = await getAiConfig();
      setAiConfigBaseUrl(config.base_url);
      setAiConfigApiKey(config.api_key);
      setAiConfigModel(config.model);
    } catch (e) {
      toast.error(`AI 配置读取失败：${e}`);
    } finally {
      setIsLoadingAiConfig(false);
    }
  };

  const closeAiSettings = () => {
    if (isSavingAiConfig || isTestingAiConnection) return;
    setIsAiSettingsOpen(false);
  };

  const handleSaveAiConfig = async () => {
    setIsSavingAiConfig(true);
    try {
      await saveAiConfig({
        base_url: aiConfigBaseUrl.trim(),
        api_key: aiConfigApiKey.trim(),
        model: aiConfigModel.trim(),
      });
      toast.success("AI 配置已保存");
      setIsAiSettingsOpen(false);
    } catch (e) {
      toast.error(`AI 配置保存失败：${getErrorMessage(e)}`);
    } finally {
      setIsSavingAiConfig(false);
    }
  };

  const handleTestAiConnection = async () => {
    setIsTestingAiConnection(true);
    setAiConnectionResult(null);
    try {
      const result = await testAiConnection();
      setAiConnectionResult(result);
      toast.success(`AI 连接正常：${result.model}`);
    } catch (e) {
      toast.error(`AI 连接测试失败：${getErrorMessage(e)}`);
    } finally {
      setIsTestingAiConnection(false);
    }
  };

  const handleSyncLuoguInsights = async () => {
    if (isDirty) {
      const ok = window.confirm("当前笔记有未保存的改动，同步洛谷后可能会切换到新导入的笔记。确定继续吗？未保存的改动将丢失。");
      if (!ok) return;
    }

    setIsSyncingLuogu(true);
    setLuoguSyncResult(null);
    try {
      const result = await syncLuoguInsights();
      setLuoguSyncResult(result);

      if (result.importedCount > 0) {
        const updated = await listNotes();
        setFiles(updated);
        const lastImportedPath = result.importedPaths[result.importedPaths.length - 1];
        if (lastImportedPath) {
          setCurrentFilePath(lastImportedPath);
          setIsDirty(false);
        }
      }

      const reachedLastText = result.reachedLastSubmissionId ? "已触达 last_submission_id" : "未触达 last_submission_id";
      const aiModelText = result.aiModel ?? "未配置";
      const syncSummary = `扫描 ${result.scannedPages} 页 / ${result.scannedCount} 条，AC ${result.acCount} 条，AI 整理：是，模型：${aiModelText}，AI 导入 ${result.aiImportedCount} 篇，AI 跳过 ${result.aiSkippedCount} 条，AI 失败 ${result.aiFailedCount} 条，无 insight ${result.skippedNoInsight} 条，已存在 ${result.skippedExisting} 条，总失败 ${result.failedCount} 条，${reachedLastText}，last_submission_id ${result.updatedLastSubmissionId ?? "未更新"}`;
      if (result.failedCount > 0) {
        toast.warning(`洛谷同步完成，但有失败：${syncSummary}`);
      } else if (result.importedCount > 0) {
        toast.success(`洛谷同步完成：${syncSummary}`);
      } else {
        toast.success(`洛谷同步完成，没有新笔记：${syncSummary}`);
      }
    } catch (e) {
      toast.error(`洛谷同步失败：${getErrorMessage(e)}`);
    } finally {
      setIsSyncingLuogu(false);
    }
  };

  const openLuoguDialog = () => {
    setIsLuoguDialogOpen(true);
  };

  const closeLuoguDialog = () => {
    if (isImportingLuogu) return;
    setIsLuoguDialogOpen(false);
    setLuoguProblemId("");
    setLuoguProblemTitle("");
    setLuoguSubmissionId("");
    setLuoguSourceCode("");
  };

  const handleImportLuogu = async () => {
    if (!luoguProblemId.trim()) {
      toast.error("题号不能为空");
      return;
    }
    if (!luoguProblemTitle.trim()) {
      toast.error("题目标题不能为空");
      return;
    }
    if (!luoguSubmissionId.trim()) {
      toast.error("提交 ID 不能为空");
      return;
    }
    if (!luoguSourceCode.trim()) {
      toast.error("源码不能为空");
      return;
    }
    if (isDirty) {
      const ok = window.confirm("当前笔记有未保存的改动，导入后会切换到新笔记。确定继续吗？未保存的改动将丢失。");
      if (!ok) return;
    }

    setIsImportingLuogu(true);
    try {
      const imported = await importLuoguInsight(
        luoguProblemId,
        luoguProblemTitle,
        luoguSubmissionId,
        luoguSourceCode,
      );

      let commitSucceeded = true;
      try {
        await commitNote(imported.relativePath);
      } catch (commitError) {
        commitSucceeded = false;
        toast.warning(`洛谷笔记已导入，AI 整理：是，模型：${imported.aiModel}，Git 提交失败：${commitError}`);
      }

      const updated = await listNotes();
      setFiles(updated);
      setCurrentFilePath(imported.relativePath);
      setIsDirty(false);
      setIsLuoguDialogOpen(false);
      setLuoguProblemId("");
      setLuoguProblemTitle("");
      setLuoguSubmissionId("");
      setLuoguSourceCode("");
      if (commitSucceeded) {
        toast.success(`洛谷笔记已导入并提交，AI 整理：是，模型：${imported.aiModel}`);
      }
    } catch (e) {
      toast.error(`洛谷导入失败：${e}`);
    } finally {
      setIsImportingLuogu(false);
    }
  };

  const handleEditorChange = (value: string) => {
    setMarkdown(value);
    setIsDirty(true);
  };

  const handlePasteImage = async (file: File) => {
    if (!currentFilePath) {
      const message = "请先打开一个笔记后再粘贴图片";
      toast.error(message);
      throw new Error(message);
    }

    try {
      const buffer = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));
      const saved = await saveNoteAsset(currentFilePath, bytes, file.type);

      setPendingAssetsByFile((prev) => {
        const current = prev[currentFilePath] ?? [];
        if (current.includes(saved.assetRelativePath)) return prev;
        return {
          ...prev,
          [currentFilePath]: [...current, saved.assetRelativePath],
        };
      });

      toast.success("图片已插入，保存后提交");
      return `![image](${saved.markdownPath})`;
    } catch (e) {
      toast.error(`图片粘贴失败：${e}`);
      throw e;
    }
  };

  const updateFrontmatter = (patch: Partial<FrontmatterFields>) => {
    if (!currentFilePath) return;
    if (!frontmatter.canMerge) {
      toast.warning(frontmatter.warning ?? "当前 frontmatter 暂不能通过表单改写");
      return;
    }

    const nextFields = { ...frontmatter.fields, ...patch };
    const nextMarkdown = mergeFrontmatterFields(markdown, nextFields);
    if (nextMarkdown === markdown) return;
    setMarkdown(nextMarkdown);
    setIsDirty(true);
  };

  const updateTagsFromInput = (value: string) => {
    const tags = value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    updateFrontmatter({ tags });
  };

  const handleSelectFile = (path: string) => {
    if (isDirty) {
      const ok = window.confirm("当前笔记有未保存的改动，切换将会丢失。确定切换吗？");
      if (!ok) return;
    }
    setCurrentFilePath(path);
  };

  const showSavedToast = (message: string, warning: string | null) => {
    if (warning) {
      toast.warning(`${message}（${warning}）`);
    } else {
      toast.success(message);
    }
  };

  // Ctrl+S / Cmd+S 保存当前笔记
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.key === "s")) return;
      e.preventDefault();
      if (currentFilePath === null) {
        toast.info("请先打开一个笔记后再保存");
        return;
      }
      try {
        const warning = await writeNote(currentFilePath, markdown);
        try {
          const pendingAssets = pendingAssetsByFile[currentFilePath] ?? [];
          const commitStatus = await commitNote(currentFilePath, pendingAssets);
          if (commitStatus === "committed") {
            showSavedToast("已保存并提交", warning);
          } else {
            showSavedToast("已保存", warning);
          }
          setPendingAssetsByFile((prev) => {
            if (!prev[currentFilePath]) return prev;
            const next = { ...prev };
            delete next[currentFilePath];
            return next;
          });
        } catch (commitError) {
          const message = `已保存，Git 提交失败：${commitError}`;
          if (warning) {
            toast.warning(`${message}（${warning}）`);
          } else {
            toast.warning(message);
          }
        }
        setIsDirty(false);
      } catch (err) {
        toast.error(`保存失败: ${err}`);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentFilePath, markdown, pendingAssetsByFile]);

  // 挂载时从后端加载笔记列表
  useEffect(() => {
    listNotes()
      .then(setFiles)
      .catch((e: Error) => console.error("加载笔记列表失败：", e.message));
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen("notes-changed", () => {
      listNotes()
        .then((updated) => {
          if (!cancelled) setFiles(updated);
        })
        .catch((e: Error) =>
          console.error("收到 notes-changed 后刷新列表失败：", e.message),
        );
    })
      .then((fn) => {
        if (cancelled) {
          // 组件已卸载，立即取消订阅
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((e: Error) =>
        console.error("注册 notes-changed 监听失败：", e.message),
      );

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // 当选中文件变化时，从后端读取内容
  // 使用 cancelled flag 防御 race condition：
  // 快速连续点击不同文件时，后到的响应可能比先到的早 resolve，
  // cancelled 确保只有最新一次 readNote 的结果会被 setMarkdown 采用。
  useEffect(() => {
    if (currentFilePath === null) {
      // 无选中文件时恢复欢迎内容
      setMarkdown(INITIAL_MARKDOWN);
      setIsDirty(false);
      return;
    }

    let cancelled = false;

    readNote(currentFilePath)
      .then((content) => {
        if (!cancelled) {
          setMarkdown(content);
          setIsDirty(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) console.error("读取笔记失败：", e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [currentFilePath]);

  return (
    <>
    <Toaster />
    <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {dialogMode === "create" ? "新建笔记" : "重命名笔记"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          {dialogMode === "create" && (
            <div className="grid gap-2">
              <Label>保存位置</Label>
              <div className="grid gap-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent/40 ${
                    newNoteDirectory === "tricks"
                      ? "border-ring bg-accent/50"
                      : "border-border bg-background"
                  }`}
                >
                  <input
                    type="radio"
                    name="note-directory"
                    value="tricks"
                    checked={newNoteDirectory === "tricks"}
                    onChange={() => updateNewNoteDirectory("tricks")}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="grid gap-1">
                    <span className="font-medium text-foreground">tricks/</span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      技巧笔记：算法 trick、模板、结论整理
                    </span>
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent/40 ${
                    newNoteDirectory === "problems"
                      ? "border-ring bg-accent/50"
                      : "border-border bg-background"
                  }`}
                >
                  <input
                    type="radio"
                    name="note-directory"
                    value="problems"
                    checked={newNoteDirectory === "problems"}
                    onChange={() => updateNewNoteDirectory("problems")}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="grid gap-1">
                    <span className="font-medium text-foreground">problems/</span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      题解笔记：题目分析、解法记录
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}
          {dialogMode === "create" && (
            <div className="grid gap-2">
              <Label>模板</Label>
              <div className="grid gap-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent/40 ${
                    newNoteTemplate === "blank"
                      ? "border-ring bg-accent/50"
                      : "border-border bg-background"
                  }`}
                >
                  <input
                    type="radio"
                    name="note-template"
                    value="blank"
                    checked={newNoteTemplate === "blank"}
                    onChange={() => setNewNoteTemplate("blank")}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="grid gap-1">
                    <span className="font-medium text-foreground">空白</span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      创建空 Markdown，由保存流程补全基础 frontmatter
                    </span>
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent/40 ${
                    newNoteTemplate === "trick"
                      ? "border-ring bg-accent/50"
                      : "border-border bg-background"
                  }`}
                >
                  <input
                    type="radio"
                    name="note-template"
                    value="trick"
                    checked={newNoteTemplate === "trick"}
                    onChange={() => setNewNoteTemplate("trick")}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="grid gap-1">
                    <span className="font-medium text-foreground">Trick 模板</span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      结论、适用条件、例子、代码
                    </span>
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent/40 ${
                    newNoteTemplate === "solution"
                      ? "border-ring bg-accent/50"
                      : "border-border bg-background"
                  }`}
                >
                  <input
                    type="radio"
                    name="note-template"
                    value="solution"
                    checked={newNoteTemplate === "solution"}
                    onChange={() => setNewNoteTemplate("solution")}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="grid gap-1">
                    <span className="font-medium text-foreground">题解模板</span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      题意、思路、证明、代码、复杂度
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="filename">文件名</Label>
            <Input
              id="filename"
              value={dialogValue}
              onChange={(e) => setDialogValue(e.target.value)}
              placeholder="不需要输入 .md"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleDialogConfirm();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              {dialogMode === "rename" && renameTarget && renameTarget.includes("/")
                ? `当前位于 ${renameTarget.slice(0, renameTarget.lastIndexOf("/"))}/，目录会保留`
                : "系统会自动加上 .md 后缀"}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeDialog}>取消</Button>
          <Button onClick={handleDialogConfirm}>
            {dialogMode === "create" ? "创建" : "重命名"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={isLuoguSettingsOpen} onOpenChange={(open) => !open && closeLuoguSettings()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>洛谷设置</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="rounded-md border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
            <div>需要从浏览器洛谷 Cookie 中复制 _uid 和 __client_id。</div>
            <div>路径：F12 - Application/应用 - Cookies - https://www.luogu.com.cn。</div>
            <div>不要把 __client_id 发给别人，也不要提交到 Git。</div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="luogu-config-uid">UID</Label>
            <Input
              id="luogu-config-uid"
              value={luoguConfigUid}
              disabled={isLoadingLuoguConfig || isSavingLuoguConfig}
              placeholder="洛谷 _uid"
              onChange={(e) => setLuoguConfigUid(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="luogu-config-client-id">__client_id</Label>
            <Input
              id="luogu-config-client-id"
              value={luoguConfigClientId}
              disabled={isLoadingLuoguConfig || isSavingLuoguConfig}
              placeholder="洛谷 __client_id"
              type="password"
              onChange={(e) => setLuoguConfigClientId(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="luogu-config-last-submission-id">last_submission_id</Label>
            <Input
              id="luogu-config-last-submission-id"
              value={luoguConfigLastSubmissionId}
              disabled={isLoadingLuoguConfig || isSavingLuoguConfig}
              placeholder="留空表示尚未同步"
              inputMode="numeric"
              onChange={(e) => setLuoguConfigLastSubmissionId(e.target.value)}
            />
          </div>
          {luoguConnectionResult && (
            <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs">
              <div className="font-medium text-foreground">
                本次 dry run 拉到 {luoguConnectionResult.fetchedCount} 条提交
              </div>
              <div className="grid gap-1 text-muted-foreground">
                {luoguConnectionResult.submissions.length === 0 ? (
                  <div>暂无提交预览</div>
                ) : (
                  luoguConnectionResult.submissions.map((submission) => (
                    <div key={submission.submissionId} className="font-mono">
                      #{submission.submissionId} {submission.problemId} {submission.problemTitle} · {submission.status} · {submission.submitTime}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          {luoguSyncResult && (
            <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs">
              <div className="font-medium text-foreground">
                洛谷同步：扫描 {luoguSyncResult.scannedPages} 页 / {luoguSyncResult.scannedCount} 条，AC {luoguSyncResult.acCount} 条，AI 导入 {luoguSyncResult.aiImportedCount} 篇
              </div>
              <div className="grid gap-1 text-muted-foreground">
                <div>
                  AI 整理：是，模型：{luoguSyncResult.aiModel ?? "未配置"}
                </div>
                <div>
                  AI 跳过 {luoguSyncResult.aiSkippedCount} 条，AI 失败 {luoguSyncResult.aiFailedCount} 条，跳过无 insight {luoguSyncResult.skippedNoInsight} 条，已存在 {luoguSyncResult.skippedExisting} 条，总失败 {luoguSyncResult.failedCount} 条
                </div>
                <div>
                  {luoguSyncResult.reachedLastSubmissionId ? "已触达 last_submission_id" : "未触达 last_submission_id"}
                </div>
                <div>
                  last_submission_id: {luoguSyncResult.updatedLastSubmissionId ?? "未更新"}
                </div>
                {luoguSyncResult.importedPaths.map((path) => (
                  <div key={path} className="font-mono">{path}</div>
                ))}
                {luoguSyncResult.warnings.slice(0, 3).map((warning) => (
                  <div key={warning} className="text-amber-400">{warning}</div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeLuoguSettings} disabled={isSavingLuoguConfig || isSyncingLuogu}>
            取消
          </Button>
          <Button
            variant="outline"
            onClick={handleTestLuoguConnection}
            disabled={isLoadingLuoguConfig || isSavingLuoguConfig || isTestingLuoguConnection || isSyncingLuogu}
          >
            测试连接
          </Button>
          <Button
            variant="outline"
            onClick={handleSyncLuoguInsights}
            disabled={isLoadingLuoguConfig || isSavingLuoguConfig || isTestingLuoguConnection || isSyncingLuogu}
          >
            同步洛谷
          </Button>
          <Button
            onClick={handleSaveLuoguConfig}
            disabled={isLoadingLuoguConfig || isSavingLuoguConfig || isTestingLuoguConnection || isSyncingLuogu}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={isAiSettingsOpen} onOpenChange={(open) => !open && closeAiSettings()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI 设置</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="rounded-md border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
            <div>使用 OpenAI-compatible Chat Completions 接口。</div>
            <div>API Key 会保存在本地 .oinb/config.json，不要提交到 Git。</div>
            <div>测试连接会请求模型返回 {"{\"ok\": true}"}。</div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ai-config-base-url">Base URL</Label>
            <Input
              id="ai-config-base-url"
              value={aiConfigBaseUrl}
              disabled={isLoadingAiConfig || isSavingAiConfig || isTestingAiConnection}
              placeholder="https://api.example.com/v1"
              onChange={(e) => setAiConfigBaseUrl(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ai-config-model">Model</Label>
            <Input
              id="ai-config-model"
              value={aiConfigModel}
              disabled={isLoadingAiConfig || isSavingAiConfig || isTestingAiConnection}
              placeholder="deepseek-chat"
              onChange={(e) => setAiConfigModel(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ai-config-api-key">API Key</Label>
            <Input
              id="ai-config-api-key"
              value={aiConfigApiKey}
              disabled={isLoadingAiConfig || isSavingAiConfig || isTestingAiConnection}
              placeholder="sk-..."
              type="password"
              onChange={(e) => setAiConfigApiKey(e.target.value)}
            />
          </div>
          {aiConnectionResult && (
            <div className="grid gap-1 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">AI 连接正常</div>
              <div>model: {aiConnectionResult.model}</div>
              <div>ok: {String(aiConnectionResult.ok)}</div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeAiSettings} disabled={isSavingAiConfig || isTestingAiConnection}>
            取消
          </Button>
          <Button
            variant="outline"
            onClick={handleTestAiConnection}
            disabled={isLoadingAiConfig || isSavingAiConfig || isTestingAiConnection}
          >
            测试连接
          </Button>
          <Button
            onClick={handleSaveAiConfig}
            disabled={isLoadingAiConfig || isSavingAiConfig || isTestingAiConnection}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={isLuoguDialogOpen} onOpenChange={(open) => !open && closeLuoguDialog()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>导入洛谷</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="luogu-problem-id">problem id</Label>
              <Input
                id="luogu-problem-id"
                value={luoguProblemId}
                placeholder="P1234 或 1234"
                disabled={isImportingLuogu}
                onChange={(e) => setLuoguProblemId(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="luogu-submission-id">submission id</Label>
              <Input
                id="luogu-submission-id"
                value={luoguSubmissionId}
                placeholder="12345678"
                disabled={isImportingLuogu}
                onChange={(e) => setLuoguSubmissionId(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="luogu-problem-title">problem title</Label>
              <Input
                id="luogu-problem-title"
                value={luoguProblemTitle}
                placeholder="题目标题"
                disabled={isImportingLuogu}
                onChange={(e) => setLuoguProblemTitle(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="luogu-source-code">source code</Label>
            <textarea
              id="luogu-source-code"
              value={luoguSourceCode}
              disabled={isImportingLuogu}
              rows={14}
              className="min-h-64 w-full resize-none rounded-none border border-input bg-transparent px-2.5 py-2 font-mono text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30 dark:disabled:bg-input/80"
              placeholder={`int main() {\n  return 0;\n}\n\n/*\n启示：\n这题的关键观察是 ...\n\n坑点：\n边界需要额外处理 ...\n*/`}
              onChange={(e) => setLuoguSourceCode(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeLuoguDialog} disabled={isImportingLuogu}>
            取消
          </Button>
          <Button onClick={handleImportLuogu} disabled={isImportingLuogu}>
            导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="text-sm font-semibold tracking-wide">OI Notebook</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {currentFilePath && (
            <>
              <span>{currentFilePath}</span>
              {isDirty && (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-foreground"
                  aria-label="有未保存的改动"
                  title="有未保存的改动"
                />
              )}
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={openLuoguDialog}
          >
            <Download className="h-3.5 w-3.5" />
            导入洛谷
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={handleTestLuoguConnection}
            disabled={isTestingLuoguConnection}
          >
            <PlugZap className="h-3.5 w-3.5" />
            测试连接
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={handleSyncLuoguInsights}
            disabled={isTestingLuoguConnection || isSyncingLuogu}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            同步洛谷
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={openLuoguSettings}
            disabled={isLoadingLuoguConfig || isSavingLuoguConfig || isTestingLuoguConnection || isSyncingLuogu}
          >
            <Settings className="h-3.5 w-3.5" />
            洛谷设置
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={openAiSettings}
            disabled={isLoadingAiConfig || isSavingAiConfig || isTestingAiConnection}
          >
            <Bot className="h-3.5 w-3.5" />
            AI 设置
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={handleOpenBlog}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            打开博客
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={handleRestartBlog}
            disabled={isRestartingBlog}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重启博客
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={handlePushGit}
            disabled={isPushingGit}
          >
            <Upload className="h-3.5 w-3.5" />
            同步 Git
          </Button>
        </div>
      </header>

      {/* Three-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: File tree (fixed 240px) */}
        <aside className="flex w-60 shrink-0 flex-col overflow-hidden">
          <div className="flex h-8 shrink-0 items-center justify-between px-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              笔记列表
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={openCreateDialog}
              title="新建笔记"
              aria-label="新建笔记"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <FileTree
              files={files}
              activeFilePath={currentFilePath}
              onSelectFile={handleSelectFile}
              onDeleteFile={handleDelete}
              onRenameFile={openRenameDialog}
            />
          </div>
        </aside>

        <Separator orientation="vertical" />

        {/* Center: Markdown editor */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {currentFilePath && (
            <details className="shrink-0 border-b border-border bg-background/95">
              <summary className="flex h-8 cursor-pointer select-none items-center justify-between px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/30">
                <span>Frontmatter</span>
                {frontmatter.warning && (
                  <span className="normal-case tracking-normal text-amber-400">
                    {frontmatter.warning}
                  </span>
                )}
              </summary>
              <div className="grid gap-3 px-4 py-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="frontmatter-title">title</Label>
                    <Input
                      id="frontmatter-title"
                      value={frontmatter.fields.title}
                      disabled={!frontmatter.canMerge}
                      onChange={(e) => updateFrontmatter({ title: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="frontmatter-tags">tags</Label>
                    <Input
                      id="frontmatter-tags"
                      value={frontmatter.fields.tags.join(", ")}
                      disabled={!frontmatter.canMerge || !frontmatter.canEditTags}
                      placeholder="DP, 线段树, trick"
                      onChange={(e) => updateTagsFromInput(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="frontmatter-difficulty">difficulty</Label>
                    <Input
                      id="frontmatter-difficulty"
                      value={frontmatter.fields.difficulty}
                      disabled={!frontmatter.canMerge}
                      onChange={(e) => updateFrontmatter({ difficulty: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="frontmatter-source">source</Label>
                    <Input
                      id="frontmatter-source"
                      value={frontmatter.fields.source}
                      disabled={!frontmatter.canMerge}
                      onChange={(e) => updateFrontmatter({ source: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="frontmatter-summary">summary</Label>
                  <textarea
                    id="frontmatter-summary"
                    value={frontmatter.fields.summary}
                    disabled={!frontmatter.canMerge}
                    rows={2}
                    className="min-h-14 w-full resize-none rounded-none border border-input bg-transparent px-2.5 py-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30 dark:disabled:bg-input/80"
                    onChange={(e) => updateFrontmatter({ summary: e.target.value })}
                  />
                </div>
                <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={frontmatter.fields.draft}
                    disabled={!frontmatter.canMerge}
                    className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                    onChange={(e) => updateFrontmatter({ draft: e.target.checked })}
                  />
                  draft
                </label>
              </div>
            </details>
          )}
          <MarkdownEditor
            value={markdown}
            onChange={handleEditorChange}
            onPasteImage={handlePasteImage}
            onScroll={(r) => setScrollRatio(r)}
            className="min-h-0 flex-1"
          />
        </main>

        <Separator orientation="vertical" />

        {/* Right: Live preview */}
        <aside className="flex flex-1 overflow-hidden">
          <MarkdownPreview
            markdown={markdown}
            noteRelativePath={currentFilePath}
            scrollRatio={scrollRatio}
            className="h-full w-full"
          />
        </aside>
      </div>
    </div>
    </>
  );
}
