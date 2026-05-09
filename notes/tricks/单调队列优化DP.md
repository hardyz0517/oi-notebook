---
title: 单调队列优化 DP：从暴力转移到滑动窗口最值
tags:
- DP
- 单调队列
- 优化
- 滑动窗口
difficulty: 提高+
source: training-note
summary: 当 DP 转移形如在一段连续区间里取最值时，可以把枚举转移点优化成维护单调队列。
draft: false
updated: 2026-05-09T22:59:34.779713900+08:00
---

# 核心直觉

如果一个 DP 转移长这样：

$$
f_i = \max_{j \in [i-k, i-1]} (f_j + value_i)
$$

那么对每个 $i$ 都重新枚举 $j$，复杂度是 $O(nk)$。

但注意到区间 $[i-k, i-1]$ 是一个**滑动窗口**，随着 $i$ 增大，左端点和右端点都只会向右移动。因此我们可以用单调队列维护窗口内最优的 $f_j$。

## 什么时候能用

常见信号：

- 转移点 $j$ 的合法范围是一段连续区间；
- 这个区间随着 $i$ 单调右移；
- 被取最值的表达式中，和 $i$ 有关的部分可以拆出去；
- 队列里每个候选点只会进出一次。

## 写法模板

```cpp
#include <bits/stdc++.h>
using namespace std;

const int N = 1000005;
long long f[N], a[N];
deque<int> q;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, k;
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

## 容易错的地方

### 1. 先弹过期，再取队首

因为当前 $i$ 的合法转移点是 $[i-k, i-1]$，如果队首已经小于 `i-k`，它虽然值可能很优，但已经不能用了。

### 2. 当前点什么时候入队

一般是：

1. 用旧队列计算 `f[i]`
2. 再把 `i` 加入队列

因为 `i` 通常不能转移到自己。

### 3. 最大值和最小值方向相反

如果维护最大值：

```cpp
while (!q.empty() && f[q.back()] <= f[i]) q.pop_back();
```

如果维护最小值：

```cpp
while (!q.empty() && f[q.back()] >= f[i]) q.pop_back();
```

## 一句话记忆

> 只要 DP 的转移范围像一个滑动窗口，就先想：能不能用单调队列维护候选最值。
