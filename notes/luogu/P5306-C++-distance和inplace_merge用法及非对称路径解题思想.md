---
title: C++ distance和inplace_merge用法及非对称路径解题思想
tags:
- C++
- STL
- 算法思想
- 非对称路径
difficulty: 未指定
source: luogu-P5306
summary: 学习C++中distance和inplace_merge的用途，以及面对非对称路径时，将物理过程转化为数学极值的解题思路。
draft: true
luogu_submission: '276913839'
ai_generated: true
ai_model: deepseek-v4-flash
updated: 2026-05-07T17:21:13.366133500+08:00
---

### 启示

#### 函数妙用：
- `distance`：它用来计算两个迭代器之间相隔了多少个元素。你可以把它理解为“迭代器相减”（last - first）的通用安全版本。
- `inplace_merge`：它可以将同一个数组或容器中，两段相邻且各自有序的区间，合并成一个整体有序的区间。它的参数接受三个迭代器：`inplace_merge(first, middle, last)`。`[first, middle)` 是前一半已经有序的区间，`[middle, last)` 是后一半已经有序的区间。执行后，整个 `[first, last)` 就会变成有序的。

#### 面对非对称路径：
将物理过程转化为数学极值。

## Links

- Original problem: https://www.luogu.com.cn/problem/P5306
- AC submission: https://www.luogu.com.cn/record/276913839
