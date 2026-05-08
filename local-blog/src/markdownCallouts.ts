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

const calloutTypes = new Set(["info", "success", "warning", "error"]);

export const remarkLuoguCallouts: Plugin = () => {
  return (tree) => {
    visit(tree, (node) => {
      if (!isDirectiveNode(node) || node.type !== "containerDirective") {
        return;
      }

      const calloutType = node.name;
      if (!calloutType || !calloutTypes.has(calloutType)) {
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

function isDirectiveNode(node: unknown): node is MarkdownNode {
  return Boolean(node && typeof node === "object" && "type" in node);
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

function defaultTitleFor(calloutType: string) {
  switch (calloutType) {
    case "success":
      return "Success";
    case "warning":
      return "Warning";
    case "error":
      return "Error";
    default:
      return "Info";
  }
}
