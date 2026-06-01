export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

export const TOOL_DESCRIPTIONS: Record<string, string> = {
  read_file: "读取沙盒中的文件内容",
  write_file: "在沙盒中创建或写入文件",
  list_files: "浏览沙盒中的目录和文件",
  shell_exec: "在沙盒中执行 Shell 命令",
  http_request: "发送 HTTP 请求访问外部 API",
  code_run: "运行 Python/JS/TS/Bash 代码片段",
};
