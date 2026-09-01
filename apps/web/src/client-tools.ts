import { CLIENT_TOOL_NAMES, type ClientToolAction, type ClientToolName, type LocalDataRepository, type Message, type PersonProfile, type RoomKind } from "@fuyue/core";
import { validateToyHtml } from "@fuyue/toybox";
import { createNativeCalendarEvent, hasAndroidDeviceBridge } from "./device-bridge";
import { readCalendarWriteTarget } from "./calendar-preferences";

export const ENABLED_CLIENT_TOOLS: ClientToolName[] = [...CLIENT_TOOL_NAMES];

const roomKinds: RoomKind[] = ["timeline", "letter", "checkin", "work", "diary", "repair", "whisper"];
const roomLabels: Record<RoomKind, string> = {
  timeline: "时间线",
  letter: "信箱",
  checkin: "碰一碰",
  work: "共同工作本",
  diary: "装修日记",
  repair: "共同修补本",
  whisper: "碎碎念",
};

const intentWords: Record<ClientToolName, string[]> = {
  update_companion_signature: ["个签", "签名", "signature"],
  set_companion_mood: ["心情", "状态", "mood"],
  create_memory_draft: ["记忆", "memory"],
  add_work_item: ["工作本", "工作项", "待办", "task", "work"],
  write_room_entry: ["时间线", "信件", "信箱", "日记", "修补", "碎碎念", "碰一碰", "timeline", "letter", "diary", "repair", "whisper", "checkin"],
  set_appearance: ["外观", "主题", "配色", "深色", "浅色", "特效", "appearance", "theme", "dark", "light"],
  create_toy: ["玩具", "游戏", "打地鼠", "小网页", "toy", "game"],
  update_toy: ["修改玩具", "改玩具", "更新游戏", "update toy", "edit toy"],
  create_calendar_event: ["日历", "日程", "安排", "行程", "课表", "提醒", "calendar", "schedule", "event"],
};

function actionMatchesCurrentRequest(action: ClientToolAction, input: string) {
  const request = input.trim().toLocaleLowerCase();
  if (!request) return false;
  const hasExplicitToolIntent = Object.values(intentWords).some((words) => words.some((word) => request.includes(word)));
  if (!hasExplicitToolIntent && action.name === "set_companion_mood") return true;
  if (!hasExplicitToolIntent && action.name === "write_room_entry" && action.arguments.room === "whisper") return true;
  if (intentWords[action.name].some((word) => request.includes(word))) return true;
  return Object.values(action.arguments).some((value) => typeof value === "string" && value.trim().length >= 4 && request.includes(value.trim().toLocaleLowerCase()));
}

export async function executeClientActions({ actions, repository, companion, sourceLabel, input }: {
  actions: ClientToolAction[];
  repository: LocalDataRepository;
  companion: PersonProfile;
  sourceLabel: string;
  input: string;
}): Promise<NonNullable<Message["toolTrace"]>> {
  let executed: string[] = [];
  try { executed = JSON.parse(window.localStorage.getItem("fuyue-public-executed-tools") || "[]") as string[]; } catch { executed = []; }
  const traces: NonNullable<Message["toolTrace"]> = [];
  for (const action of actions.slice(0, 4)) {
    if (executed.includes(action.id)) { traces.push({ name: action.name, status: "success", summary: "这项本机操作已经执行过，没有重复写入" }); continue; }
    if (!actionMatchesCurrentRequest(action, input)) {
      traces.push({ name: action.name, status: "failed", summary: "模型返回的操作和这轮要求对不上，未写入本机" });
      continue;
    }
    try {
      if (action.name === "update_companion_signature") {
        const signature = typeof action.arguments.signature === "string" ? action.arguments.signature.trim().slice(0, 160) : "";
        await repository.savePerson({ ...companion, signature });
        traces.push({ name: action.name, status: "success", summary: signature ? `伙伴个签已改为“${signature}”` : "伙伴个签已留空" });
      } else if (action.name === "set_companion_mood") {
        const title = typeof action.arguments.title === "string" ? action.arguments.title.trim().slice(0, 80) : "";
        const detail = typeof action.arguments.detail === "string" ? action.arguments.detail.trim().slice(0, 500) : "";
        if (!title || !detail) throw new Error("伙伴心情缺少标题或说明");
        await repository.createRoomEntry({ room: "checkin", author: "companion", title, content: detail, subtype: "companion_mood", sourceLabel });
        traces.push({ name: action.name, status: "success", summary: `伙伴此刻的心情已写为“${title}”` });
      } else if (action.name === "create_memory_draft") {
        const title = typeof action.arguments.title === "string" ? action.arguments.title.trim().slice(0, 120) : "";
        const memoryContent = typeof action.arguments.content === "string" ? action.arguments.content.trim().slice(0, 4000) : "";
        if (!title || !memoryContent) throw new Error("记忆草稿缺少标题或内容");
        await repository.createMemory({ title, content: memoryContent, layer: "working" });
        traces.push({ name: action.name, status: "success", summary: `已写入待审记忆草稿“${title}”` });
      } else if (action.name === "add_work_item") {
        const title = typeof action.arguments.title === "string" ? action.arguments.title.trim().slice(0, 160) : "";
        const workContent = typeof action.arguments.content === "string" ? action.arguments.content.trim().slice(0, 4000) : "";
        if (!title) throw new Error("工作项缺少标题");
        await repository.createRoomEntry({ room: "work", author: "companion", title, content: workContent || title, subtype: "assistant_action", sourceLabel });
        traces.push({ name: action.name, status: "success", summary: `已加入共同工作本“${title}”` });
      } else if (action.name === "write_room_entry") {
        const room = typeof action.arguments.room === "string" && roomKinds.includes(action.arguments.room as RoomKind) ? action.arguments.room as RoomKind : null;
        const title = typeof action.arguments.title === "string" ? action.arguments.title.trim().slice(0, 160) : "";
        const content = typeof action.arguments.content === "string" ? action.arguments.content.trim().slice(0, 4000) : "";
        const subtype = typeof action.arguments.subtype === "string" ? action.arguments.subtype.trim().slice(0, 80) : "assistant_action";
        if (!room || !content) throw new Error("房间记录缺少有效房间或内容");
        await repository.createRoomEntry({ room, author: "companion", title, content, subtype, sourceLabel });
        traces.push({ name: action.name, status: "success", summary: `已写入${roomLabels[room]}${title ? `“${title}”` : ""}` });
      } else if (action.name === "set_appearance") {
        const settings = await repository.getSettings();
        const themes = ["redleaf", "blue", "sakura", "wisteria", "tide", "amber"];
        const modes = ["light", "dark"];
        const effects = ["none", "snow", "rain", "heart", "leaf", "butterfly", "star", "bubble", "glow", "paw"];
        const next = { ...settings };
        if (typeof action.arguments.theme === "string" && themes.includes(action.arguments.theme)) next.theme = action.arguments.theme as typeof next.theme;
        if (typeof action.arguments.mode === "string" && modes.includes(action.arguments.mode)) next.mode = action.arguments.mode as typeof next.mode;
        if (typeof action.arguments.effect === "string" && effects.includes(action.arguments.effect)) next.effect = action.arguments.effect as typeof next.effect;
        await repository.saveSettings(next);
        traces.push({ name: action.name, status: "success", summary: "外观已经按这次请求写入本机设置" });
      } else if (action.name === "create_toy") {
        const title = typeof action.arguments.title === "string" ? action.arguments.title.trim().slice(0, 120) : "";
        const html = typeof action.arguments.html === "string" ? validateToyHtml(action.arguments.html) : "";
        if (!title || !html) throw new Error("玩具缺少名字或完整 HTML");
        const toy = await repository.createToy({ title, html, createdBy: "companion", sourceLabel });
        const saved = (await repository.listToys()).find((item) => item.id === toy.id);
        if (!saved || saved.html !== html) throw new Error("玩具写入后没有从 LocalData 读回");
        traces.push({ name: action.name, status: "success", summary: `已写入玩具盒“${title}”，安全沙箱已校验` });
      } else if (action.name === "update_toy") {
        const targetTitle = typeof action.arguments.targetTitle === "string" ? action.arguments.targetTitle.trim() : "";
        const title = typeof action.arguments.title === "string" ? action.arguments.title.trim().slice(0, 120) : "";
        const html = typeof action.arguments.html === "string" ? validateToyHtml(action.arguments.html) : "";
        const target = (await repository.listToys(true)).find((item) => item.status === "active" && item.title.toLocaleLowerCase() === targetTitle.toLocaleLowerCase());
        if (!targetTitle || !target) throw new Error(`玩具盒里没有名为“${targetTitle || "未指定"}”的可修改玩具`);
        if (target.createdBy === "system") throw new Error("内置玩具不可覆盖；可以另做一个新版本");
        if (!title || !html) throw new Error("修改玩具需要新名字和完整 HTML");
        await repository.saveToy({ ...target, title, html, sourceLabel, updatedAt: new Date().toISOString() });
        const saved = (await repository.listToys(true)).find((item) => item.id === target.id);
        if (!saved || saved.title !== title || saved.html !== html) throw new Error("修改后没有从 LocalData 读回一致版本");
        traces.push({ name: action.name, status: "success", summary: `玩具“${targetTitle}”已更新为“${title}”，旧游玩记录仍保留` });
      } else if (action.name === "create_calendar_event") {
        if (!hasAndroidDeviceBridge()) throw new Error("这台设备没有 Android 系统日历桥，未写入");
        const calendarId = readCalendarWriteTarget();
        if (!calendarId) throw new Error("请先在“日历与课表”选一个默认写入日历");
        const title = typeof action.arguments.title === "string" ? action.arguments.title.trim().slice(0, 200) : "";
        const startAt = typeof action.arguments.startAt === "string" ? Date.parse(action.arguments.startAt) : Number.NaN;
        const endAt = typeof action.arguments.endAt === "string" ? Date.parse(action.arguments.endAt) : Number.NaN;
        const location = typeof action.arguments.location === "string" ? action.arguments.location.trim().slice(0, 500) : "";
        const notes = typeof action.arguments.notes === "string" ? action.arguments.notes.trim().slice(0, 2000) : "";
        const allDay = action.arguments.allDay === true;
        if (!title || !Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) throw new Error("日程缺少有效标题或起止时间");
        if (endAt - startAt > 31 * 86_400_000) throw new Error("单条日程不能跨过 31 天");
        await createNativeCalendarEvent({ calendarId, title, startAt, endAt, location, notes: notes || "由伙伴在赴约中添加", allDay });
        traces.push({ name: action.name, status: "success", summary: `已写入手机日历“${title}”` });
      }
      executed.push(action.id);
    } catch (cause) {
      traces.push({ name: action.name, status: "failed", summary: cause instanceof Error ? cause.message : "这项本机操作没有完成" });
    }
  }
  window.localStorage.setItem("fuyue-public-executed-tools", JSON.stringify(executed.slice(-200)));
  return traces;
}
