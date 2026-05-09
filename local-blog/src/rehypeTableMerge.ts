import type { Element, Root } from "hast";

type TableCell = Element & {
  tagName: "td" | "th";
};

export function rehypeTableMerge() {
  return (tree: Root) => {
    visitElements(tree, (node) => {
      if (node.tagName === "table") {
        mergeTableRowspans(node);
      }
    });
  };
}

function mergeTableRowspans(table: Element) {
  for (const group of getRowGroups(table)) {
    mergeRowGroup(group);
  }
}

function getRowGroups(table: Element): Element[][] {
  const groups: Element[][] = [];
  const directRows: Element[] = [];

  for (const child of table.children) {
    if (!isElement(child)) {
      continue;
    }

    if (child.tagName === "tr") {
      directRows.push(child);
      continue;
    }

    if (child.tagName === "thead" || child.tagName === "tbody" || child.tagName === "tfoot") {
      const rows = child.children.filter((row): row is Element => isElement(row) && row.tagName === "tr");
      if (rows.length > 0) {
        groups.push(rows);
      }
    }
  }

  if (directRows.length > 0) {
    groups.push(directRows);
  }

  return groups;
}

function mergeRowGroup(rows: Element[]) {
  const lastRealCells: Array<TableCell | undefined> = [];

  for (const row of rows) {
    let columnIndex = 0;
    const nextChildren: typeof row.children = [];

    for (const child of row.children) {
      if (!isTableCell(child)) {
        nextChildren.push(child);
        continue;
      }

      if (isMergeMarkerCell(child)) {
        const targetCell = lastRealCells[columnIndex];
        if (targetCell) {
          incrementRowspan(targetCell);
        } else {
          nextChildren.push(child);
        }
      } else {
        lastRealCells[columnIndex] = child;
        nextChildren.push(child);
      }

      columnIndex += getColspan(child);
    }

    row.children = nextChildren;
  }
}

function isMergeMarkerCell(cell: TableCell) {
  return getPlainText(cell)?.trim() === "^";
}

function getPlainText(element: Element): string | null {
  let text = "";

  for (const child of element.children) {
    if (child.type !== "text") {
      return null;
    }

    text += child.value;
  }

  return text;
}

function incrementRowspan(cell: TableCell) {
  const properties = (cell.properties ??= {});
  const current = Number(properties.rowSpan ?? properties.rowspan ?? 1);
  properties.rowSpan = Number.isSafeInteger(current) && current >= 1 ? current + 1 : 2;
}

function getColspan(cell: TableCell) {
  const value = Number(cell.properties?.colSpan ?? cell.properties?.colspan ?? 1);
  return Number.isSafeInteger(value) && value >= 1 ? value : 1;
}

function isTableCell(node: unknown): node is TableCell {
  return isElement(node) && (node.tagName === "td" || node.tagName === "th");
}

function isElement(node: unknown): node is Element {
  return Boolean(node && typeof node === "object" && "type" in node && node.type === "element");
}

function visitElements(node: Root | Element, visitor: (node: Element) => void) {
  for (const child of node.children) {
    if (!isElement(child)) {
      continue;
    }

    visitor(child);
    visitElements(child, visitor);
  }
}
