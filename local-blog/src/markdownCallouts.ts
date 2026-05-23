import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

type DirectiveNode = {
  type: string;
  name?: string;
  attributes?: Record<string, unknown>;
  children?: MarkdownNode[];
  data?: Record<string, unknown>;
};

type MarkdownNode = DirectiveNode & {
  value?: string;
};

type ParentNode = {
  children?: MarkdownNode[];
};

type CuteTableConfig = {
  classes: string[];
  dataAttributes?: Record<string, string>;
};

const calloutTypes = new Set(["info", "success", "warning", "error"]);
const alignDirections = ["left", "center", "right"] as const;

type AlignDirection = (typeof alignDirections)[number];

export const remarkLuoguCallouts: Plugin = () => {
  return (tree) => {
    transformCuteTableDirectives(tree as ParentNode);

    visit(tree, (node) => {
      if (!isDirectiveNode(node) || node.type !== "containerDirective") {
        return;
      }

      const calloutType = node.name;
      if (!calloutType || !calloutTypes.has(calloutType)) {
        if (node.name === "align") {
          transformAlignDirective(node);
          return;
        }

        if (node.name === "epigraph") {
          transformEpigraphDirective(node);
        }

        return;
      }

      const children = node.children ?? [];
      const labelIndex = children.findIndex(isDirectiveLabel);
      const isOpen = Object.prototype.hasOwnProperty.call(node.attributes ?? {}, "open");
      const titleNode =
        labelIndex === -1
          ? createTitleNode(defaultTitleFor(calloutType), isOpen)
          : createTitleNode(children[labelIndex].children ?? [], isOpen);
      const bodyChildren =
        labelIndex === -1
          ? children
          : [...children.slice(0, labelIndex), ...children.slice(labelIndex + 1)];

      node.children = [titleNode, createBodyNode(bodyChildren, isOpen)];
      node.data = {
        ...(node.data ?? {}),
        hName: "div",
        hProperties: {
          className: ["oi-callout", `oi-callout-${calloutType}`, isOpen ? "oi-callout-open" : ""]
            .filter(Boolean)
            .join(" "),
          "data-callout": calloutType,
          "data-callout-collapsible": "true",
          "data-open": isOpen ? "true" : "false",
          "data-state": isOpen ? "open" : "collapsed",
        },
      };
    });
  };
};

function transformCuteTableDirectives(node: ParentNode) {
  if (!node.children || node.children.length === 0) {
    return;
  }

  const nextChildren: MarkdownNode[] = [];
  let pendingCuteTable: CuteTableConfig | null = null;

  for (const child of node.children) {
    if (isCuteTableDirective(child)) {
      pendingCuteTable = parseCuteTableConfig(child.attributes);
      continue;
    }

    if (pendingCuteTable && child.type === "table") {
      applyCuteTableConfig(child, pendingCuteTable);
      pendingCuteTable = null;
      nextChildren.push(child);
      continue;
    }

    pendingCuteTable = null;
    nextChildren.push(child);
  }

  node.children = nextChildren;

  for (const child of node.children) {
    transformCuteTableDirectives(child as ParentNode);
  }
}

function transformAlignDirective(node: MarkdownNode) {
  const direction = getAlignDirection(node.attributes);
  if (!direction) {
    return;
  }

  node.data = {
    ...(node.data ?? {}),
    hName: "div",
    hProperties: {
      className: `oi-align oi-align-${direction}`,
      "data-align": direction,
    },
  };
}

function transformEpigraphDirective(node: MarkdownNode) {
  const children = node.children ?? [];
  const labelIndex = children.findIndex(isDirectiveLabel);
  const bodyChildren =
    labelIndex === -1
      ? children
      : [...children.slice(0, labelIndex), ...children.slice(labelIndex + 1)];
  const nextChildren = [createEpigraphBodyNode(bodyChildren)];

  if (labelIndex !== -1) {
    nextChildren.push(createEpigraphCaptionNode(children[labelIndex].children ?? []));
  }

  node.children = nextChildren;
  node.data = {
    ...(node.data ?? {}),
    hName: "figure",
    hProperties: {
      className: "oi-epigraph",
    },
  };
}

function getAlignDirection(attributes: Record<string, unknown> | undefined): AlignDirection | null {
  for (const direction of alignDirections) {
    if (Object.prototype.hasOwnProperty.call(attributes ?? {}, direction)) {
      return direction;
    }
  }

  return null;
}

function isDirectiveNode(node: unknown): node is MarkdownNode {
  return Boolean(node && typeof node === "object" && "type" in node);
}

function isCuteTableDirective(node: MarkdownNode) {
  return node.type === "leafDirective" && node.name === "cute-table";
}

function parseCuteTableConfig(
  attributes: Record<string, unknown> | undefined,
): CuteTableConfig | null {
  if (Object.prototype.hasOwnProperty.call(attributes ?? {}, "three")) {
    return {
      classes: ["oi-cute-table", "oi-cute-table-three"],
    };
  }

  if (!Object.prototype.hasOwnProperty.call(attributes ?? {}, "tuack")) {
    return null;
  }

  const tuackValue = attributes?.tuack;
  if (tuackValue === "" || tuackValue === true || tuackValue == null) {
    return {
      classes: ["oi-cute-table", "oi-cute-table-tuack"],
    };
  }

  if (String(tuackValue).trim() === "3") {
    return {
      classes: ["oi-cute-table", "oi-cute-table-tuack", "oi-cute-table-tuack-split-3"],
      dataAttributes: {
        "data-tuack-split": "3",
      },
    };
  }

  return null;
}

function applyCuteTableConfig(node: MarkdownNode, config: CuteTableConfig) {
  const data = (node.data ??= {});
  const hProperties = ((data.hProperties as Record<string, unknown> | undefined) ??= {});
  const classNames = normalizeClassNames(hProperties.className);

  for (const className of config.classes) {
    if (!classNames.includes(className)) {
      classNames.push(className);
    }
  }

  hProperties.className = classNames;

  for (const [key, value] of Object.entries(config.dataAttributes ?? {})) {
    hProperties[key] = value;
  }
}

function normalizeClassNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    return value
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function isDirectiveLabel(node: MarkdownNode) {
  return Boolean(node.data && node.data.directiveLabel === true);
}

function createTitleNode(children: MarkdownNode[] | string, isOpen: boolean): MarkdownNode {
  return {
    type: "paragraph",
    children: typeof children === "string" ? [{ type: "text", value: children }] : children,
    data: {
      hName: "div",
      hProperties: {
        "aria-expanded": isOpen ? "true" : "false",
        className: "oi-callout-title",
        role: "button",
      },
    },
  };
}

function createBodyNode(children: MarkdownNode[], isOpen: boolean): MarkdownNode {
  return {
    type: "containerDirectiveBody",
    children,
    data: {
      hName: "div",
      hProperties: {
        className: "oi-callout-body",
        ...(!isOpen ? { hidden: true } : {}),
      },
    },
  };
}

function createEpigraphBodyNode(children: MarkdownNode[]): MarkdownNode {
  return {
    type: "containerDirectiveBody",
    children,
    data: {
      hName: "div",
      hProperties: {
        className: "oi-epigraph-body",
      },
    },
  };
}

function createEpigraphCaptionNode(children: MarkdownNode[]): MarkdownNode {
  return {
    type: "paragraph",
    children,
    data: {
      hName: "figcaption",
      hProperties: {
        className: "oi-epigraph-caption",
      },
    },
  };
}

function defaultTitleFor(calloutType: string) {
  switch (calloutType) {
    case "success":
      return "完成";
    case "warning":
      return "注意";
    case "error":
      return "错误";
    default:
      return "提示";
  }
}
