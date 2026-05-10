---
title: md测试
tags: []
difficulty: 牛逼
source: ''
created: 2026-05-08T15:01:44.529837800+08:00
updated: 2026-05-10T16:17:35.677447700+08:00
summary: ''
draft: false
---
# 代码块增强测试
```cpp
b >>= 1;
a <<= 1;
if (x >= 0 && y <= 10 || z >> 2) return 0;
```
## 1. 无语言代码块：应默认按 C++ 高亮

下面这个**代码**块没有写语言*名，但应*该按 C++ 高亮。

```
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

## 2. 指定 C++ 并高亮行

下面这个代码块写了 `cpp lines=5-6,11`，应该高亮第 5、6、11 行。

```cpp lines=5-6,11
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);  // 第 5 行：应该高亮
    cin.tie(nullptr);             // 第 6 行：应该高亮

    int a, b;
    cin >> a >> b;
    cout << a + b << '\n';
    return 0;                     // 第 11 行：应该高亮
}
```

## 3. 波浪线 fence：也应支持行高亮

下面这个代码块用波浪线包裹，写了 `cpp lines=2,4-5`，应该高亮第 2、4、5 行。

~~~cpp lines=2,4-5 showLineNumbers
long long qpow(long long a, long long b, long long mod) {
    long long res = 1;            // 第 2 行：应该高亮
    while (b) {
        if (b & 1) res = res * a % mod;  // 第 4 行：应该高亮
        a = a * a % mod;                 // 第 5 行：应该高亮
        b >>= 1;
    }
    return res;
}
~~~

## 4. 非法 lines 参数：不应报错

下面这个 `lines` 参数是混乱的，预览不应该炸。能高亮合法部分就高亮，不能就忽略。

```cpp lines=abc,2-?,4
int main() {
    int x = 1;
    int y = 2;
    cout << x + y << '\n';
    return 0;
}
```


# align / epigraph 测试

## 1. align left

:::align{left}
这段文字应该居左。

### 这个标题也应该居左

普通段落继续居左。
:::

## 2. align center

:::align{center}
这段文字应该居中。

### 这个标题也应该居中

数学公式也应该整体居中显示：$a_i + b_i = c_i$
:::

## 3. align right

:::align{right}
这段文字应该居右。

### 这个标题也应该居右

普通段落继续居右。
:::

## 4. align 嵌套测试

::::align{right}
外层应该居右。

:::align{center}
内层应该居中。
:::

外层结束前，这一段应该继续居右。
::::

## 5. epigraph 测试

:::epigraph[——otto]
大家好啊，我是说的道理。

这里是第二段，用来测试 epigraph 里的多段正文。
:::

## 6. epigraph 内含 Markdown

:::epigraph[——某位 OIer]
如果一个转移看起来很复杂，先试着把它拆成 **状态设计** 和 **贡献计算**。

也可以写一点公式：$dp_i = \min(dp_j + w(j,i))$。
:::

## 7. 未知 directive 测试

下面这个未知类型不应该套用 align 或 epigraph 样式，也不应该把页面渲染炸掉。

:::unknown[未知类型]
这里是未知 directive 的内容。

- 列表项一
- 列表项二
:::
