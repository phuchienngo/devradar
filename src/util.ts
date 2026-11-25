/** Thông điệp lỗi dạng chuỗi. */
export const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
