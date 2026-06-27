# sample-lib

一个轻量级 TypeScript 工具库，提供字符串处理、数组操作和校验助手。

## 特性

- 字符串处理工具（格式化、截断、大小写转换）
- 数组操作助手（去重、分组、排序）
- 数据校验（邮箱、URL、手机号）
- 完整的 TypeScript 类型支持
- 零外部运行时依赖

## 技术栈

- TypeScript
- Node.js >= 18

## 安装

```bash
npm install sample-lib
# 或
pnpm add sample-lib
```

## 使用

```ts
import { greet, formatDate, validateEmail } from "sample-lib";

console.log(greet("World"));
// => "Hello, World!"

console.log(formatDate(new Date()));
// => "2026-01-15"

console.log(validateEmail("test@example.com"));
// => true
```

## API

### greet(name: string): string

返回问候语。

### formatDate(date: Date, format?: string): string

格式化日期，默认返回 ISO 格式。

### validateEmail(email: string): boolean

校验邮箱格式。

### dedupe<T>(arr: T[]): T[]

数组去重。

## 许可证

MIT
