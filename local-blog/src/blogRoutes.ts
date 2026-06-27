export type Route =
  | { name: "home"; page: number }
  | { name: "articles"; page: number; year: string | null }
  | { name: "tags"; page: number }
  | { name: "tag"; tag: string; page: number }
  | { name: "collections"; page: number }
  | { name: "collection"; collection: string; page: number }
  | { name: "search"; query: string; page: number }
  | { name: "note"; encodedPath: string; relativePath: string };

export type ReturnTarget = {
  href: string;
  label: string;
};

export function getHashPath(hash: string) {
  const queryStart = hash.indexOf("?");
  return queryStart === -1 ? hash : hash.slice(0, queryStart);
}

export function getHashParams(hash: string) {
  const queryStart = hash.indexOf("?");
  return new URLSearchParams(queryStart === -1 ? "" : hash.slice(queryStart + 1));
}

function parseRoutePage(hash: string) {
  const page = Number(getHashParams(hash).get("page") ?? "1");
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function withPageParam(hashPath: string, page = 1, extraParams?: Record<string, string>) {
  const params = new URLSearchParams(extraParams);
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `${hashPath}?${query}` : hashPath;
}

export function getRouteFromHash(hash: string): Route {
  const safeHash = hash || "#/";
  const hashPath = getHashPath(safeHash);
  const page = parseRoutePage(safeHash);
  const notePrefix = "#/note/";
  const tagsPrefix = "#/tags/";
  const tagPrefix = "#/tag/";
  const collectionsPrefix = "#/collections/";
  const collectionPrefix = "#/collection/";
  const categoriesPrefix = "#/categories/";
  const categoryPrefix = "#/category/";
  const searchPrefix = "#/search";

  if (hashPath.startsWith(notePrefix)) {
    const encodedPath = hashPath.slice(notePrefix.length);
    if (!encodedPath) {
      return { name: "home", page: 1 };
    }

    try {
      return {
        name: "note",
        encodedPath,
        relativePath: decodeURIComponent(encodedPath),
      };
    } catch {
      return {
        name: "note",
        encodedPath,
        relativePath: "",
      };
    }
  }

  if (hashPath === "#/articles") {
    return { name: "articles", page, year: getHashParams(safeHash).get("year") };
  }

  if (hashPath === "#/tags") {
    return { name: "tags", page };
  }

  if (hashPath.startsWith(tagsPrefix)) {
    try {
      return { name: "tag", tag: decodeURIComponent(hashPath.slice(tagsPrefix.length)), page };
    } catch {
      return { name: "tags", page: 1 };
    }
  }

  if (hashPath.startsWith(tagPrefix)) {
    try {
      return { name: "tag", tag: decodeURIComponent(hashPath.slice(tagPrefix.length)), page };
    } catch {
      return { name: "tags", page: 1 };
    }
  }

  if (hashPath === "#/collections" || hashPath === "#/categories") {
    return { name: "collections", page };
  }

  if (hashPath.startsWith(collectionsPrefix)) {
    try {
      return { name: "collection", collection: decodeURIComponent(hashPath.slice(collectionsPrefix.length)), page };
    } catch {
      return { name: "collections", page: 1 };
    }
  }

  if (hashPath.startsWith(collectionPrefix)) {
    try {
      return { name: "collection", collection: decodeURIComponent(hashPath.slice(collectionPrefix.length)), page };
    } catch {
      return { name: "collections", page: 1 };
    }
  }

  if (hashPath.startsWith(categoriesPrefix)) {
    try {
      return { name: "collection", collection: decodeURIComponent(hashPath.slice(categoriesPrefix.length)), page };
    } catch {
      return { name: "collections", page: 1 };
    }
  }

  if (hashPath.startsWith(categoryPrefix)) {
    try {
      return {
        name: "collection",
        collection: decodeURIComponent(hashPath.slice(categoryPrefix.length)),
        page,
      };
    } catch {
      return { name: "collections", page: 1 };
    }
  }

  if (hashPath === searchPrefix) {
    const params = getHashParams(safeHash);
    return { name: "search", query: params.get("q")?.trim() ?? "", page };
  }

  return { name: "home", page };
}

function stripHashPrefix(hashHref: string) {
  return hashHref.startsWith("#") ? hashHref.slice(1) : hashHref;
}

export function getNoteHref(relativePath: string, fromHref?: string) {
  const noteHref = `#/note/${encodeURIComponent(relativePath)}`;
  if (!fromHref) {
    return noteHref;
  }

  const params = new URLSearchParams({ from: stripHashPrefix(fromHref) });
  return `${noteHref}?${params.toString()}`;
}

export function getHomeHref(page = 1) {
  return withPageParam("#/", page);
}

export function getArticlesHref(page = 1, year?: string | null) {
  return withPageParam("#/articles", page, year ? { year } : undefined);
}

export function getTagHref(tag: string, page = 1) {
  return withPageParam(`#/tags/${encodeURIComponent(tag)}`, page);
}

export function getTagsHref(page = 1) {
  return withPageParam("#/tags", page);
}

export function getCollectionHref(collection: string, page = 1) {
  return withPageParam(`#/collections/${encodeURIComponent(collection)}`, page);
}

export function getCollectionsHref(page = 1) {
  return withPageParam("#/collections", page);
}

export function getSearchHref(query: string, page = 1) {
  const trimmed = query.trim();
  return withPageParam("#/search", page, trimmed ? { q: trimmed } : undefined);
}

export function getRouteReturnHref(route: Exclude<Route, { name: "note"; encodedPath: string; relativePath: string }>) {
  if (route.name === "home") return getHomeHref(route.page);
  if (route.name === "articles") return getArticlesHref(route.page, route.year);
  if (route.name === "tags") return getTagsHref(route.page);
  if (route.name === "tag") return getTagHref(route.tag, route.page);
  if (route.name === "collections") return getCollectionsHref(route.page);
  if (route.name === "collection") return getCollectionHref(route.collection, route.page);
  if (route.name === "search") return getSearchHref(route.query, route.page);
  return "#/articles";
}

export function isSafeReturnPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || /[\u0000-\u001f\u007f]/.test(path)) {
    return false;
  }

  const hashPath = getHashPath(`#${path}`);
  return (
    hashPath === "#/" ||
    hashPath === "#/articles" ||
    hashPath === "#/tags" ||
    hashPath.startsWith("#/tags/") ||
    hashPath.startsWith("#/tag/") ||
    hashPath === "#/collections" ||
    hashPath.startsWith("#/collections/") ||
    hashPath.startsWith("#/collection/") ||
    hashPath === "#/categories" ||
    hashPath.startsWith("#/categories/") ||
    hashPath.startsWith("#/category/") ||
    hashPath === "#/search"
  );
}

function getReturnLabel(path: string) {
  const hashPath = getHashPath(`#${path}`);
  if (hashPath === "#/") return "\u8fd4\u56de\u9996\u9875";
  if (hashPath === "#/tags" || hashPath.startsWith("#/tags/") || hashPath.startsWith("#/tag/")) return "\u8fd4\u56de\u6807\u7b7e";
  if (
    hashPath === "#/collections" ||
    hashPath.startsWith("#/collections/") ||
    hashPath.startsWith("#/collection/") ||
    hashPath === "#/categories" ||
    hashPath.startsWith("#/categories/") ||
    hashPath.startsWith("#/category/")
  ) return "\u8fd4\u56de\u6587\u96c6";
  if (hashPath === "#/search") return "\u8fd4\u56de\u641c\u7d22";
  return "\u8fd4\u56de\u6587\u7ae0\u5217\u8868";
}

export function getNoteReturnTargetFromHash(hash: string): ReturnTarget {
  const from = getHashParams(hash).get("from");
  if (from && isSafeReturnPath(from)) {
    return {
      href: `#${from}`,
      label: getReturnLabel(from),
    };
  }

  return {
    href: "#/articles",
    label: "\u8fd4\u56de\u6587\u7ae0\u5217\u8868",
  };
}
