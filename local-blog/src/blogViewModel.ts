import {
  getTagPathSegments,
  getTagSuggestionList,
  tagPathSeparator,
  type TagTreeNode,
} from "./tagTaxonomy";

export type TagChipItem = {
  label: string;
  fullPath: string;
  count: number;
};

export type PaginationItem = number | "ellipsis";

const tagSuggestionSearchByPath = new Map(
  getTagSuggestionList().map((item) => [item.pathText, item.searchText]),
);

export function getTagChipLabel(node: TagTreeNode) {
  if (node.depth <= 3) {
    return node.name;
  }

  const segments = getTagPathSegments(node.fullPath);
  return segments.slice(2).join(` ${tagPathSeparator} `);
}

export function collectTagChips(node: TagTreeNode): TagChipItem[] {
  return [
    {
      label: getTagChipLabel(node),
      fullPath: node.fullPath,
      count: node.count,
    },
    ...node.children.flatMap(collectTagChips),
  ];
}

export function collectRelatedTagChips(node: TagTreeNode): TagChipItem[] {
  return node.children.flatMap((child) => {
    if (child.children.length === 0) {
      const segments = getTagPathSegments(child.fullPath);
      const parentDepth = node.depth;

      return [{
        label: segments.slice(parentDepth).join(` ${tagPathSeparator} `),
        fullPath: child.fullPath,
        count: child.count,
      }];
    }

    return collectRelatedTagChips(child);
  });
}

export function normalizeTagSearchText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

export function normalizeCompactTagSearchText(value: string) {
  return normalizeTagSearchText(value).replace(/\s+/g, "");
}

export function getTagChipSearchText(item: TagChipItem) {
  return [
    item.label,
    item.fullPath,
    tagSuggestionSearchByPath.get(item.fullPath) ?? "",
  ].join(" ");
}

export function matchesTagChipSearch(item: TagChipItem, query: string) {
  const normalizedQuery = normalizeTagSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const searchText = getTagChipSearchText(item);
  return (
    normalizeTagSearchText(searchText).includes(normalizedQuery) ||
    normalizeCompactTagSearchText(searchText).includes(normalizeCompactTagSearchText(query))
  );
}

export function getPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const items: PaginationItem[] = [];

  for (const page of sortedPages) {
    const previous = items[items.length - 1];
    if (typeof previous === "number" && page - previous > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  }

  return items;
}
