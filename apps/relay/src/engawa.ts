import { ProviderError } from "./providers.js";

export const ENGAWA_READ_TOOLS = ["web_read", "rss_read", "shelf", "shelf_suggest", "sky_tonight", "apod", "daily_art", "arxiv_new", "daily_poem", "on_this_day"] as const;
export const ENGAWA_WRITE_TOOLS = ["shelf_add", "shelf_remove"] as const;
const TOOL_SET = new Set<string>([...ENGAWA_READ_TOOLS, ...ENGAWA_WRITE_TOOLS]);

function base(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Engawa sidecar must use loopback HTTP");
  return url.toString().replace(/\/$/, "");
}

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new ProviderError("Engawa 返回了无法识别的内容", 502); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProviderError("Engawa 返回格式不完整", 502);
  return value as Record<string, unknown>;
}

export async function engawaStatus(url: string, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; service: string; detail: string; tools: string[] }> {
  try {
    const response = await fetcher(`${base(url)}/health`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(3_000) });
    const value = await jsonBody(response);
    const tools = Array.isArray(value.tools) ? value.tools.filter((tool): tool is string => typeof tool === "string" && TOOL_SET.has(tool)) : [];
    if (!response.ok || value.ok !== true) return { ok: false, service: "Engawa MCP", detail: "内置适配器已就位，侧车还没有启动。", tools: [...ENGAWA_READ_TOOLS, ...ENGAWA_WRITE_TOOLS] };
    return { ok: true, service: "Engawa MCP", detail: `侧车已连接；${tools.length} 项工具可用。`, tools };
  } catch {
    return { ok: false, service: "Engawa MCP", detail: "内置适配器已就位，侧车还没有启动。运行 npm run setup:engawa 后再开全家。", tools: [...ENGAWA_READ_TOOLS, ...ENGAWA_WRITE_TOOLS] };
  }
}

export async function engawaAction(url: string, tool: string, args: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; tool: string; content: unknown; sourceLabel: string }> {
  if (!TOOL_SET.has(tool)) throw new ProviderError("这个 Engawa 动作不在公开适配器白名单里", 400);
  if (Object.keys(args).length > 10 || JSON.stringify(args).length > 8_000) throw new ProviderError("Engawa 参数过多", 400);
  let response: Response;
  try {
    response = await fetcher(`${base(url)}/tool/${encodeURIComponent(tool)}`, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(args), signal: AbortSignal.timeout(30_000),
    });
  } catch { throw new ProviderError("Engawa 侧车没有响应", 503); }
  const value = await jsonBody(response);
  if (!response.ok || value.ok !== true) throw new ProviderError(typeof value.error === "string" ? value.error.slice(0, 240) : "Engawa 动作失败", response.status >= 400 ? response.status : 502);
  return { ok: true, tool, content: value.result, sourceLabel: "Engawa MCP · 本机侧车" };
}
