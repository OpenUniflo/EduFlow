# 可复用浏览器回归助手

这些模块接收调用者准备的真实浏览器页面，验证 Assignment 闭环、Course Navigator 和 Micro review。它们不启动浏览器、不重置学习状态，也不自动生成产品验收结论。

调用者需要提供明确的测试账号、目标地址和相应新场景；普通 `pnpm test` / `pnpm test:workflow` 不会执行浏览器操作。历史阶段验收源码不再作为入口。
