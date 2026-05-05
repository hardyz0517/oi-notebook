function normalizeBasePath(basePath) {
  const trimmed = basePath.replace(/\/+$/, "");
  return trimmed ? `/${trimmed.replace(/^\/+/, "")}` : "";
}

function toNoteAssetPath(src) {
  const normalized = src.replace(/\\/g, "/");
  const lower = normalized.toLowerCase();

  if (
    normalized === "" ||
    normalized.startsWith("/") ||
    normalized.includes("?") ||
    normalized.includes("#") ||
    /^[a-z][a-z0-9+.-]*:/.test(lower)
  ) {
    return null;
  }

  const withoutCurrentDir = normalized.replace(/^(\.\/)+/, "");
  const match = withoutCurrentDir.match(/^(?:(?:\.\.\/)+)?assets\/(.+)$/);

  if (!match) {
    return null;
  }

  return `assets/${match[1]}`;
}

function rewriteImageSrc(node, basePath) {
  if (node?.type !== "element" || node.tagName !== "img") {
    return;
  }

  const src = node.properties?.src;
  if (typeof src !== "string") {
    return;
  }

  const assetPath = toNoteAssetPath(src);
  if (!assetPath) {
    return;
  }

  node.properties.src = `${basePath}/${assetPath}`;
}

function rewriteMarkdownImageUrl(node, basePath) {
  if (node?.type !== "image" && node?.type !== "definition") {
    return;
  }

  const url = node.url;
  if (typeof url !== "string") {
    return;
  }

  const assetPath = toNoteAssetPath(url);
  if (!assetPath) {
    return;
  }

  node.url = `${basePath}/${assetPath}`;
}

function visit(node, basePath) {
  rewriteImageSrc(node, basePath);
  rewriteMarkdownImageUrl(node, basePath);

  if (!Array.isArray(node?.children)) {
    return;
  }

  for (const child of node.children) {
    visit(child, basePath);
  }
}

export function rehypeNoteAssets(options = {}) {
  const basePath = normalizeBasePath(options.basePath ?? "");

  return (tree, file) => {
    visit(tree, basePath);

    const localImagePaths = file.data.astro?.localImagePaths;
    if (Array.isArray(localImagePaths)) {
      file.data.astro.localImagePaths = localImagePaths.filter(
        (imagePath) => typeof imagePath !== "string" || !toNoteAssetPath(imagePath),
      );
    }
  };
}

export function remarkNoteAssets(options = {}) {
  const basePath = normalizeBasePath(options.basePath ?? "");

  return (tree) => {
    visit(tree, basePath);
  };
}
