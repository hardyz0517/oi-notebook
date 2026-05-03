---
title: "Tag Search Test Draft"
tags:
  - search
  - tag-test
  - luogu
  - blog-test
difficulty: "test"
source: "manual-test"
created: "2026-05-03T12:10:00+08:00"
updated: "2026-05-03T12:10:00+08:00"
summary: "Tracked draft note for testing tag pages, search data, TOC, code blocks, and math rendering."
draft: true
---

## Test Purpose

This draft note is intentionally placed under `notes/luogu/` to test category pages, tag pages, and search behavior. It is not generated from a real Luogu submission.

### Tag Page Coverage

The tags `search`, `tag-test`, `luogu`, and `blog-test` should be available to the local blog during development.

### Search Coverage

Search should match the title, summary, tags, category, and body text for this draft note.

## Code Block

```cpp
#include <bits/stdc++.h>
using namespace std;

int lower_bound_test(vector<int> a, int target) {
    return int(lower_bound(a.begin(), a.end(), target) - a.begin());
}
```

## Math Formula

The KaTeX renderer should handle this expression:

$$
f_i = \min_{0 \le j < i}(f_j + (i-j)^2)
$$

### Search Keywords

Use this note for searching `tag-test`, `luogu`, and `lower_bound_test`.
