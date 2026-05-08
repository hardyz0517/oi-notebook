---
title: md测试
tags: []
difficulty: ''
source: ''
created: 2026-05-08T15:01:44.529837800+08:00
updated: 2026-05-08T15:44:11.718836900+08:00
summary: ''
draft: false
---
# 代码块增强测试

## 1. 无语言代码块：应默认按 C++ 高亮

下面这个代码块没有写语言名，但应该按 C++ 高亮。

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

~~~cpp lines=2,4-5
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