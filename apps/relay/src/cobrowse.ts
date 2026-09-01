export type CobrowseInspection = {
  status: "read" | "blocked";
  requestedUrl: string;
  finalUrl: string;
  sourceLabel: string;
  title: string;
  summary: string;
  detail: string;
};

const ALLOWED_HOSTS = new Set(["github.com", "www.github.com", "xhslink.com", "www.xhslink.com", "xhslink.cn", "www.xhslink.cn", "xiaohongshu.com", "www.xiaohongshu.com"]);
const URL_PATTERN = /https?:\/\/[^\s<>{}"'，。！？；：、）】]+/giu;
const MAX_PAGE_BYTES = 1_200_000;

function safeUrl(value: string): URL {
  let parsed: URL;
  try { parsed = new URL(value.trim()); }
  catch { throw new Error("链接格式不正确"); }
  if (parsed.protocol !== "https:") throw new Error("一起看只读取 HTTPS 公开链接");
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) throw new Error("一起看目前只读取公开的小红书和 GitHub 链接");
  parsed.hash = "";
  return parsed;
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&").replaceAll("&quot;", "\"").replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ").trim();
}

function meta(html: string, names: string[]): string {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeEntities(match[1]).slice(0, 1_500);
    }
  }
  return "";
}

function pageTitle(html: string): string {
  return meta(html, ["og:title", "twitter:title"]) || decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").slice(0, 300);
}

function sourceLabel(url: URL): string {
  return url.hostname.includes("github.com") ? "GitHub 公开页面" : "小红书公开页面";
}

function blocked(requestedUrl: string, finalUrl: string, label: string, detail: string): CobrowseInspection {
  return { status: "blocked", requestedUrl, finalUrl, sourceLabel: label, title: "没有读到公开正文", summary: "", detail };
}

export function supportedCobrowseUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) || [];
  const result: string[] = [];
  for (const match of matches) {
    try {
      const value = safeUrl(match).toString();
      if (!result.includes(value)) result.push(value);
    } catch { /* Unsupported URLs remain ordinary chat text. */ }
    if (result.length >= 3) break;
  }
  return result;
}

export async function inspectCobrowseUrl(value: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<CobrowseInspection> {
  const requested = safeUrl(value);
  let current = requested;
  const timeout = AbortSignal.timeout(15_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    const response = await fetcher(current, {
      method: "GET", redirect: "manual", signal: combined,
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "FuyueCobrowse/1.0 (+public-link-reader)" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return blocked(requested.toString(), current.toString(), sourceLabel(current), "来源返回了没有目标的跳转，未继续读取。");
      if (redirects === 4) return blocked(requested.toString(), current.toString(), sourceLabel(current), "链接跳转次数过多，未继续读取。");
      current = safeUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) return blocked(requested.toString(), current.toString(), sourceLabel(current), `来源返回 ${response.status}，可能需要登录、已失效或限制了公开读取。`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("text/html")) return blocked(requested.toString(), current.toString(), sourceLabel(current), "链接没有返回可审阅的网页正文。");
    const declaredLength = Number.parseInt(response.headers.get("content-length") || "0", 10);
    if (declaredLength > MAX_PAGE_BYTES) return blocked(requested.toString(), current.toString(), sourceLabel(current), "网页过大，未把整页送入模型。");
    const html = (await response.text()).slice(0, MAX_PAGE_BYTES);
    const title = pageTitle(html);
    const summary = meta(html, ["og:description", "description", "twitter:description"]);
    const loginWall = /登录后查看|扫码登录|sign in to github|you must be logged in/i.test(`${title}\n${summary}\n${html.slice(0, 30_000)}`);
    if (loginWall || (!title && !summary)) return blocked(requested.toString(), current.toString(), sourceLabel(current), loginWall ? "页面要求登录，伙伴没有假装读到正文。" : "页面没有返回可核对的标题或摘要。");
    return {
      status: "read", requestedUrl: requested.toString(), finalUrl: current.toString(), sourceLabel: sourceLabel(current),
      title: title || "未命名公开页面", summary, detail: "relay 已从公开页面读回标题与摘要；评论只依据这些可核对内容。",
    };
  }
  return blocked(requested.toString(), current.toString(), sourceLabel(current), "链接没有完成读取。");
}

export function inspectionContext(items: CobrowseInspection[]): string {
  if (!items.length) return "";
  return `\n\n[一起看公开链接读回]\n${items.map((item, index) => item.status === "read"
    ? `${index + 1}. 已读 ${item.sourceLabel}\n标题：${item.title}\n摘要：${item.summary || "来源没有提供摘要"}\n最终链接：${item.finalUrl}`
    : `${index + 1}. 未读成功\n链接：${item.finalUrl}\n原因：${item.detail}\n不得声称看过页面正文。`).join("\n\n")}`;
}
