/**
 * 问候函数
 */
export function greet(name: string): string {
  return `Hello, ${name}!`;
}

/**
 * 日期格式化
 */
export function formatDate(date: Date, format: string = "ISO"): string {
  if (format === "ISO") {
    return date.toISOString().split("T")[0];
  }
  return date.toLocaleDateString();
}

/**
 * 邮箱校验
 */
export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * 数组去重
 */
export function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
