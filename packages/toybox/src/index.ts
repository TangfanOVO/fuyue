export type ToyBridgeKind = "checkpoint" | "score" | "chat" | "complete";
export type ToyBridgeDetails = Record<string, string | number | boolean | null>;
export interface ToyBridgeEvent {
  source: "fuyue-toy";
  version: 1;
  token: string;
  type: ToyBridgeKind;
  eventId: string;
  summary: string;
  details: ToyBridgeDetails;
}

export const MAX_TOY_HTML_BYTES = 120_000;
const kinds = new Set<ToyBridgeKind>(["checkpoint", "score", "chat", "complete"]);
const forbiddenTags = /<(?:iframe|frame|frameset|object|embed|portal|base|form)\b/i;
const refreshMeta = /<meta\b[^>]*http-equiv\s*=\s*["']?refresh\b/i;
const externalAttribute = /\b(?:src|href|action|poster)\s*=\s*(["'])\s*(?:https?:|\/\/|javascript:|data:text\/html)/i;
const externalCss = /(?:@import\s+|url\(\s*["']?\s*(?:https?:|\/\/|javascript:|data:text\/html))/i;

function bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function validateToyHtml(value: string): string {
  const html = String(value || "").replaceAll("\u0000", "").trim();
  if (!/<(?:!doctype\s+html|html)\b/i.test(html)) throw new TypeError("玩具必须是完整的 HTML 文档");
  if (bytes(html) > MAX_TOY_HTML_BYTES) throw new TypeError(`玩具超过 ${Math.round(MAX_TOY_HTML_BYTES / 1000)} KB`);
  if (forbiddenTags.test(html)) throw new TypeError("玩具含有不允许的嵌入、表单或页面导航标签");
  if (refreshMeta.test(html)) throw new TypeError("玩具不能自动跳转页面");
  if (externalAttribute.test(html) || externalCss.test(html)) throw new TypeError("玩具不能引用网络、跳转脚本或外部页面");
  return html;
}

function sanitizeDetails(value: unknown): ToyBridgeDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: ToyBridgeDetails = {};
  for (const [key, detail] of Object.entries(value).slice(0, 30)) {
    const safeKey = key.trim().slice(0, 80);
    if (!safeKey) continue;
    if (detail === null || typeof detail === "boolean") result[safeKey] = detail;
    else if (typeof detail === "number" && Number.isFinite(detail)) result[safeKey] = detail;
    else if (typeof detail === "string") result[safeKey] = detail.slice(0, 500);
  }
  return result;
}

export function parseToyBridgeEvent(value: unknown, token: string): ToyBridgeEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const kind = String(item.type || "") as ToyBridgeKind;
  const eventId = String(item.eventId || "").slice(0, 120);
  const summary = String(item.summary || "").trim().slice(0, 240);
  if (item.source !== "fuyue-toy" || item.version !== 1 || item.token !== token || !kinds.has(kind) || !summary || !/^[A-Za-z0-9_.:-]+$/.test(eventId)) return null;
  return { source: "fuyue-toy", version: 1, token, type: kind, eventId, summary, details: sanitizeDetails(item.details) };
}

export function buildSandboxedToyDocument(value: string, token: string): string {
  const html = validateToyHtml(value);
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none'; child-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'">`;
  const bridge = `<script>(()=>{const token=${JSON.stringify(token)};const allowed=new Set(['checkpoint','score','chat','complete']);window.FuyueToy=Object.freeze({emit:(kind,summary,details={})=>{if(!allowed.has(kind)||typeof summary!=='string'||!summary.trim())return false;window.parent.postMessage({source:'fuyue-toy',version:1,token,type:kind,eventId:'toy.'+Date.now()+'.'+Math.random().toString(36).slice(2,10),summary:summary.trim().slice(0,240),details:details&&typeof details==='object'?details:{}},'*');return true;}});})();</script>`;
  const withCsp = /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${csp}`) : html.replace(/<html(?:\s[^>]*)?>/i, (root) => `${root}<head>${csp}</head>`);
  return /<body(?:\s[^>]*)?>/i.test(withCsp) ? withCsp.replace(/<body(?:\s[^>]*)?>/i, (body) => `${body}${bridge}`) : `${withCsp}${bridge}`;
}

export const WHACK_A_MOLE_TITLE = "心情打地鼠";
export const WHACK_A_MOLE_HTML = String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>心情打地鼠</title><style>
:root{font-family:system-ui,-apple-system,"Noto Sans SC",sans-serif;color:#342d28;background:#f4ead7}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at 20% 10%,#fff9,transparent 34%),#f4ead7}.game{width:min(440px,100%);text-align:center}h1{margin:0;font-family:"Songti SC",serif;font-size:clamp(28px,9vw,44px)}p{color:#6b5c50;line-height:1.55}.bar{display:flex;justify-content:center;gap:10px;margin:16px 0}.bar span{min-width:92px;padding:9px 12px;border:1px solid #bfa58a;border-radius:999px;background:#fff8}.board{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.hole{position:relative;aspect-ratio:1;border:0;border-radius:50%;background:#c8a981;box-shadow:inset 0 12px 18px #765b4580;overflow:hidden;touch-action:manipulation}.mole{position:absolute;inset:28% 18% -10%;border-radius:48% 48% 38% 38%;background:#704a38;transform:translateY(100%);transition:transform .13s ease-out}.mole:before,.mole:after{content:"";position:absolute;top:22%;width:9px;height:9px;border-radius:50%;background:#f6ddbf}.mole:before{left:27%}.mole:after{right:27%}.hole.up .mole{transform:translateY(0)}.hole:focus-visible{outline:4px solid #9b3d42;outline-offset:3px}button.start{min-height:48px;margin-top:18px;padding:0 24px;border:0;border-radius:999px;background:#8b3f45;color:white;font-weight:750;font-size:16px}.message{min-height:24px;font-weight:700;color:#8b3f45}@media(prefers-reduced-motion:reduce){.mole{transition:none}}
</style></head><body><main class="game"><h1>心情打地鼠</h1><p>三十秒。看见冒头的小地鼠就按下它，键盘也可以玩。</p><div class="bar"><span>得分 <b id="score">0</b></span><span>剩余 <b id="time">30</b> 秒</span></div><div class="board" id="board" aria-label="打地鼠游戏区"></div><p class="message" id="message" aria-live="polite">点开始，把那口气敲出去。</p><button class="start" id="start">开始一轮</button></main><script>
const board=document.querySelector('#board'),scoreEl=document.querySelector('#score'),timeEl=document.querySelector('#time'),message=document.querySelector('#message'),start=document.querySelector('#start');let score=0,left=30,timer=null,pop=null,active=-1;for(let i=0;i<9;i++){const button=document.createElement('button');button.className='hole';button.type='button';button.setAttribute('aria-label','第 '+(i+1)+' 个地洞');button.innerHTML='<span class="mole"></span>';button.addEventListener('click',()=>hit(i));board.append(button)}const holes=[...board.children];function emit(kind,summary,details){window.FuyueToy?.emit(kind,summary,details)}function hit(i){if(i!==active)return;score++;scoreEl.textContent=score;holes[i].classList.remove('up');active=-1;message.textContent=score%5===0?'好，已经敲出去 '+score+' 下。':'';emit('score','打中一只小地鼠',{score})}function show(){holes.forEach(h=>h.classList.remove('up'));let next=Math.floor(Math.random()*holes.length);if(next===active)next=(next+1)%holes.length;active=next;holes[next].classList.add('up');holes[next].focus({preventScroll:true});pop=setTimeout(show,Math.max(320,820-score*10))}function finish(){clearInterval(timer);clearTimeout(pop);holes.forEach(h=>h.classList.remove('up'));active=-1;start.disabled=false;message.textContent='这轮得了 '+score+' 分。不好受的那口气，有没有松一点？';emit('complete','完成一轮心情打地鼠',{score,seconds:30})}function begin(){clearInterval(timer);clearTimeout(pop);score=0;left=30;scoreEl.textContent=score;timeEl.textContent=left;start.disabled=true;message.textContent='来了。';emit('checkpoint','开始一轮心情打地鼠',{seconds:30});show();timer=setInterval(()=>{left--;timeEl.textContent=left;if(left<=0)finish()},1000)}start.addEventListener('click',begin);
</script></body></html>`;
