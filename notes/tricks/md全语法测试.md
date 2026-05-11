---
title: Markdown 全能力渲染测试
date: 2026-05-10
tags:
- markdown
- 渲染测试
- OI
- DP
source: manual
summary: 用于测试 OI Notebook 的 Markdown、代码高亮、数学公式、表格、callout、cute-table、表格合并和搜索能力。
updated: 2026-05-11T16:23:13.681382700+08:00
difficulty: ''
draft: false
---
# Markdown 全能力渲染测试

这篇笔记用于测试 **OI Notebook** 的主要 Markdown 渲染能力。

这里有普通文字、**加粗**、*斜体*、***加粗斜体***、~~删除线~~、`inline code`、链接：[洛谷](https://www.luogu.com.cn/)，以及一段英文 mixed with Chinese text。

搜索测试关键词：  
`渲染测试`、`DP`、`单调队列`、`正文搜索关键词 AlphaBetaGamma`。

---

## 1. 标题层级

# 一级标题

## 二级标题

### 三级标题

#### 四级标题

##### 五级标题

###### 六级标题

---

## 2. 段落与引用

普通段落第一行。  
普通段落第二行，测试软换行。

> 这是一级引用。
>
> > 这是嵌套引用。
>
> 引用中也可以有 **加粗**、`代码` 和数学公式 $a^2+b^2=c^2$。

---

## 3. 列表

### 无序列表

- 图论
  - 最短路
  - 最小生成树
  - 网络流
- 数据结构
  - 线段树
  - 平衡树
  - 树状数组
- 动态规划
  - 背包
  - 区间 DP
  - 树形 DP

### 有序列表

1. 先读题。
2. 设状态。
3. 写转移。
4. 验证边界。
5. 写代码并对拍。

### 任务列表

- [x] 支持 GFM task list
- [x] 支持表格
- [x] 支持代码高亮
- [ ] 支持 `<` 表格横向合并，暂时不要求

---

## 4. 数学公式

行内公式：$f_i=\max(f_i, f_j+a_i)$。

块级公式：

$$
f_i=\max_{j\in[i-k,i-1]}(f_j+a_i)
$$

多行公式：

$$
\begin{aligned}
dp_i &= \max_{j<i}(dp_j+w_{j,i}) \\
ans &= \max_{1\le i\le n} dp_i
\end{aligned}
$$

矩阵：

$$
\begin{bmatrix}
1 & 1 \\
1 & 0
\end{bmatrix}^n
$$

---

## 5. 普通代码块

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int a, b;
    cin >> a >> b;
    cout << a + b << '\n';
    return 0;
}
```

---

## 6. C++ 操作符保真测试

这里重点看编辑区和预览区是否都能正确显示 `>>=`、`<<=`、`<=`、`>=`，不能变成字体连字。

```cpp
int main() {
    b >>= 1;
    a <<= 1;

    if (x >= 0 && y <= 10 || z >> 2) {
        return 0;
    }

    while (!q.empty() && f[q.back()] <= f[i])
        q.pop_back();

    q.push_back(i);
}
```

---

## 7. 代码块行高亮

下面这个代码块应高亮第 2、4、5 行。

```cpp lines=2,4-5
long long qpow(long long a, long long b, long long mod) {
    long long res = 1;
    while (b) {
        if (b & 1) res = res * a % mod;
        a = a * a % mod;
        b >>= 1;
    }
    return res;
}
```

---

## 8. 代码块行号

下面这个代码块应该显示行号。

```cpp showLineNumbers
#include <bits/stdc++.h>
using namespace std;

const int N = 100005;

int n, k;
long long f[N], a[N];

deque<int> q;

int main() {
    cin >> n >> k;
    for (int i = 1; i <= n; i++) cin >> a[i];

    q.push_back(0);

    for (int i = 1; i <= n; i++) {
        while (!q.empty() && q.front() < i - k) q.pop_front();
        f[i] = f[q.front()] + a[i];
        while (!q.empty() && f[q.back()] <= f[i]) q.pop_back();
        q.push_back(i);
    }

    cout << f[n] << '\n';
    return 0;
}
```

---

## 9. 行号 + 行高亮

```cpp lines=5-6,11 showLineNumbers
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int a, b;
    cin >> a >> b;

    cout << a + b << '\n';
    return 0;
}
```

---

## 10. 长代码横向滚动

```cpp
long long very_long_function_name_for_testing_horizontal_scroll(long long first_parameter, long long second_parameter, long long third_parameter, long long fourth_parameter, long long fifth_parameter) {
    return first_parameter + second_parameter + third_parameter + fourth_parameter + fifth_parameter;
}
```

---

## 11. 普通 GFM 表格

| 测试点 | $n$ | $m$ | 特殊性质 |
|---:|---:|---:|:---|
| 1 | 100 | 100 | 无 |
| 2 | 1000 | 1000 | A |
| 3 | $10^5$ | $10^5$ | B |

---

## 12. cute-table three

::cute-table{three}

| 测试点编号 | $n \le$ | $m \le$ | 特殊性质 |
|---:|---:|---:|:---|
| 1 ~ 2 | 100 | 100 | 无 |
| 3 ~ 4 | $10^3$ | $10^3$ | A |
| 5 | $10^5$ | $10^5$ | B |

---

## 13. cute-table tuack

::cute-table{tuack}

| 测试点编号 | $n \le$ | $m \le$ | 特殊性质 |
|---:|---:|---:|:---|
| 1 ~ 2 | 100 | 100 | 无 |
| 3 ~ 4 | $10^3$ | $10^3$ | A |
| 5 | $10^5$ | $10^5$ | B |

---

## 14. cute-table tuack 分列

::cute-table{tuack=3}

| 测试点编号 | $n \le$ | $m \le$ | 测试点编号 | $n \le$ | $m \le$ |
|---:|---:|---:|---:|---:|---:|
| 1 | 100 | 100 | 6 | $10^5$ | $10^5$ |
| 2 | 100 | 1000 | 7 | $10^5$ | $10^5$ |
| 3 | 1000 | 1000 | 8 | $10^5$ | $10^5$ |

---

## 15. 表格纵向合并 `^`

| 测试点 | $n$ | $m$ | 特殊性质 |
|---:|---:|---:|:---|
| 1 | 100 | 100 | 无 |
| 2 | ^ | 200 | A |
| 3 | 300 | 300 | B |
| 4 | 400 | 400 | C |

---

## 16. 表格连续纵向合并

| 测试点 | $n$ | $m$ | 特殊性质 |
|---:|---:|---:|:---|
| 1 | 100 | 100 | 无 |
| 2 | ^ | 200 | A |
| 3 | ^ | 300 | B |
| 4 | 400 | 400 | C |

---

## 17. 多列同时纵向合并

| 测试点 | $n$ | $m$ | 特殊性质 |
|---:|---:|---:|:---|
| 1 | 100 | 100 | 无 |
| 2 | ^ | ^ | A |
| 3 | ^ | ^ | B |
| 4 | 400 | 400 | C |

---

## 18. 表格右向横向合并 `>`

| 名称 | 说明 | 复杂度 |
|:---|:---|:---|
| 单调队列 | > | $O(n)$ |
| 线段树 | 区间维护 | $O(n\log n)$ |
| 树状数组 | 单点修改，前缀查询 | $O(\log n)$ |

---

## 19. 表格合并 + cute-table three

::cute-table{three}

| 测试点 | $n$ | $m$ | 特殊性质 |
|---:|---:|---:|:---|
| 1 | 100 | 100 | 无 |
| 2 | ^ | 200 | A |
| 3 | 300 | 300 | B |

---

## 20. `cute-table` 后面不是表格

::cute-table{three}

这里不是表格，所以这段 directive 应该被安全忽略，不应该把页面渲染炸掉。

---

## 21. 连续 cute-table

::cute-table{three}

| A | B |
|---:|---:|
| 1 | 2 |

::cute-table{tuack}

| C | D |
|---:|---:|
| 3 | 4 |

---

## 22. Callout 测试

:::callout{type="info" title="提示"}
这是一个 info callout，用来测试普通提示框。
:::

:::callout{type="warning" title="注意"}
这是一个 warning callout。  
这里有 `inline code` 和公式 $O(n\log n)$。
:::

:::callout{type="danger" title="易错点"}
不要把 `q.front() < i-k` 写成 `q.front() <= i-k`，否则窗口边界会错。
:::

---

## 23. align 测试

:::align{type="left"}
这段文字应该左对齐。
:::

:::align{type="center"}
这段文字应该居中。
:::

:::align{type="right"}
这段文字应该右对齐。
:::

---

## 24. epigraph 测试

:::epigraph{source="训练后速记"}
不要只记录 AC 代码，要记录自己为什么错、怎么调出来、下次怎么避免。
:::

---

## 25. 图片测试

下面是一个相对路径图片测试。如果本地没有这个文件，应该显示为无法加载，但页面不能炸。

![测试图片](assets/test-image.png)

---

## 26. 链接、脚注、转义

这是一个脚注测试。[^note]

这是转义测试：\*这里不应该变成斜体\*。

[^note]: 这里是脚注内容，测试 GFM footnote。

---

## 27. HTML / 特殊字符保真

代码内的 `<`、`>`、`&` 必须保真：

```cpp
if (l < r && a[i] > b[j]) {
    cout << "<tag>" << '&' << '\n';
}
```

普通正文里的尖括号：`<vector<int>>`、`a < b`、`x >= y`。

---

## 28. 搜索测试区

以下内容用于测试搜索功能。

- tag 搜索：`DP`、`单调队列`、`渲染测试`
- 正文搜索关键词：`AlphaBetaGamma`
- 中文正文关键词：`这是一段用于测试正文搜索的独特句子`
- 路径搜索建议：把文件放到 `tricks/markdown-render-full-test.md`

---

## 29. 混合压力测试

:::callout{type="info" title="单调队列优化 DP"}
考虑转移：

$$
f_i=\max_{j\in[i-k,i-1]}(f_j+a_i)
$$

可以维护一个候选下标队列，使队头始终是当前窗口内最优的 $j$。

```cpp lines=8-9 showLineNumbers
for (int i = 1; i <= n; i++) {
    while (!q.empty() && q.front() < i - k) q.pop_front();

    f[i] = f[q.front()] + a[i];

    while (!q.empty() && f[q.back()] <= f[i]) {
        q.pop_back();
    }

    q.push_back(i);
}
```

| 步骤 | 操作 | 说明 |
|---:|:---|:---|
| 1 | 弹出过期队头 | 保证窗口合法 |
| 2 | 读取队头 | 队头是最优转移 |
| 3 | 维护单调性 | 删除不可能再优的元素 |
:::

---

## 30. 结尾

如果这一行能正常显示，说明整篇测试文档至少没有把渲染器炸掉。