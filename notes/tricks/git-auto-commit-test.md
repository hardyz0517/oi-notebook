---
title: Git Auto Commit Test Draft
tags:
- git
- auto-commit
- blog-test
difficulty: test
source: manual-test
created: 2026-05-03T12:00:00+08:00
updated: 2026-05-03T20:55:06.274520100+08:00
summary: Tracked draft note for testing save-time Git auto commit and blog rendering.
draft: true
---

## Test Purpose

This is an intentionally artificial draft note. It exists to test the desktop save flow, automatic single-file Git commit behavior, and blog UI rendering.

### Expected Git Behavior

After editing this file in OI Notebook and pressing save, only this note should be staged and committed.

### Expected Blog Behavior

The local blog should render this note in development mode, while production GitHub Pages builds should skip it because `draft: true`.

## Code Block

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> a = {1, 2, 3, 4};
    int sum = 0;
    for (int x : a) sum += x;
    cout << "git auto commit draft test: " << sum << '\n';
    return 0;
}
```

## Math Check

The KaTeX renderer should display this formula:

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

### Search Keywords

Use this note for searching `git`, `auto-commit`, and `blog-test`.


自动 commit 验收：第一次修改。