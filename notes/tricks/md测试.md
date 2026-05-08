---
title: md测试
tags: []
difficulty: ''
source: ''
created: 2026-05-08T15:01:44.529837800+08:00
updated: 2026-05-08T15:08:05.247810500+08:00
summary: ''
draft: false
---
# Callout 渲染测试

这篇笔记用来测试洛谷风格 callout 是否正常渲染。

:::info[提示]
这是一个普通提示块。

它里面应该支持普通 Markdown，比如 **加粗**、`inline code`，以及数学公式：$a_i + b_i$。

```cpp
int add(int a, int b) {
    return a + b;
}
```
:::

:::success[结论]{open}
这是一个带 `{open}` 标记的 success callout。

目前 open 不需要折叠交互，只要能显示一个 open 状态标记即可。

- 结论一
- 结论二
- 结论三
:::

:::warning[坑点]
注意边界情况。

如果 $n = 1$，很多转移都需要单独处理。

> 这里还测试一下引用块是否能放在 callout 内。
:::

:::error[反例]
下面是一个容易 WA 的写法：

```cpp
for (int i = 1; i < n; i++) {
    ans += a[i + 1] - a[i];
}
```

如果数组下标没有处理好，这里可能越界。
:::

## 嵌套 callout 测试

::::warning[外层警告]
外层 warning 内容。

:::info[内层提示]
这是嵌套在 warning 里的 info。

- 嵌套列表
- 嵌套数学：$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$
:::

外层 warning 结束前的内容。
::::

## 未识别 directive 测试

下面这个不是支持的 callout 类型，应该不要套用 callout 样式，也不要把页面渲染炸掉。

:::unknown[未知类型]
这里是未知 directive 的内容。
:::