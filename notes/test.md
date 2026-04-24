# 快速幂模板

这是一个真实从后端读取的笔记文件，说明 Rust 文件系统命令已正常工作。

## 代码

```cpp
long long qpow(long long base, long long exp, long long mod) {
    long long result = 1;
    base %= mod;
    while (exp > 0) {
        if (exp & 1) result = result * base % mod;
        base = base * base % mod;
        exp >>= 1;
    }
    return result;
}
```

## 复杂度

时间复杂度 $O(\log n)$，空间复杂度 $O(1)$。

## 使用场景

- 求 $a^b \bmod p$
- 矩阵快速幂（将 `long long` 换成矩阵类型）
- 费马小定理求逆元：$a^{-1} \equiv a^{p-2} \pmod{p}$（$p$ 为质数）
