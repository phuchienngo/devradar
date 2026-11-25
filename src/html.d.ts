// wrangler nạp file .html như chuỗi (module rule mặc định kiểu Text)
declare module '*.html' {
  const content: string;
  export default content;
}
