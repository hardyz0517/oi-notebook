---
title: Post Navigation Test Draft
tags:
- navigation
- toc
- blog-test
difficulty: test
source: manual-test
created: 2026-05-03T12:05:00+08:00
updated: 2026-05-13T18:46:04.407144900+08:00
summary: Tracked draft note for testing post ordering, previous/next links, TOC, code, and math.
draft: true
---

## Test Purpose
123
This draft note is intentionally created for checking post navigation and article layout. It is not a real competitive programming note.

### Previous And Next Links

Use this file together with the other tracked draft test notes to inspect previous and next post links in local development.

### Table Of Contents

The `##` and `###` headings here should appear in the article table of contents.

## Sample Code

```cpp
#include <bits/stdc++.h>
using namespace std;

long long qpow(long long a, long long b, long long mod) {
    long long ans = 1 % mod;
    while (b > 0) {
        if (b & 1) ans = ans * a % mod;
        a = a * a % mod;
        b >>= 1;
    }
    return ans;
}
```

## Math Formula

The math block below checks KaTeX in a post-navigation test note:

$$
a^b \bmod m
$$

### Search Keywords

Use this note for searching `navigation`, `toc`, and `qpow`.
