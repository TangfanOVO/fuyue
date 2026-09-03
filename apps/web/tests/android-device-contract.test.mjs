import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const plugin = await readFile(new URL("../../../android/app/src/main/java/love/fuyue/phone/FuyueDevicePlugin.java", import.meta.url), "utf8");
const activity = await readFile(new URL("../../../android/app/src/main/java/love/fuyue/phone/MainActivity.java", import.meta.url), "utf8");
const manifest = await readFile(new URL("../../../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.tsx", import.meta.url), "utf8");
const voicePlugin = await readFile(new URL("../../../android/app/src/main/java/love/fuyue/phone/FuyueVoicePlugin.java", import.meta.url), "utf8");
const voicePanel = await readFile(new URL("../src/voice-call-panel.tsx", import.meta.url), "utf8");
const browserLiveCall = await readFile(new URL("../src/browser-live-call.ts", import.meta.url), "utf8");
const nativeGateway = await readFile(new URL("../../../android/app/src/main/java/love/fuyue/phone/FuyueNativeGatewayPlugin.java", import.meta.url), "utf8");

test("Android calendar is a device capability, not a model connection redirect", () => {
  assert.match(manifest, /android\.permission\.READ_CALENDAR/);
  assert.match(manifest, /android\.permission\.WRITE_CALENDAR/);
  assert.match(activity, /registerPlugin\(FuyueDevicePlugin\.class\)/);
  for (const method of ["requestCalendarAccess", "openAppSettings", "listCalendars", "readCalendar", "openCreateEvent", "createCalendarEvent"]) {
    assert.match(plugin, new RegExp(`public void ${method}\\(PluginCall call\\)`));
  }
  assert.match(plugin, /Intent\.ACTION_INSERT/);
  assert.match(plugin, /Instances\.CONTENT_URI/);
  assert.match(plugin, /Events\.CONTENT_URI/);
  assert.match(app, /featureFor\("life\.calendar"\)/);
  assert.match(app, /CalendarCapabilitySetup/);
  assert.doesNotMatch(app, /openCalendarSetup\s*=\s*\(\)\s*=>\s*openPanel\("connection"\)/);
});

test("Android resizes the chat viewport above the software keyboard", () => {
  assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
});

test("Android LocalData export uses the system save picker and only reports success after writing", () => {
  assert.match(activity, /registerPlugin\(FuyueDevicePlugin\.class\)/);
  assert.match(plugin, /Intent\.ACTION_CREATE_DOCUMENT/);
  assert.match(plugin, /startActivityForResult\(call, intent, "saveJsonDocumentResult"\)/);
  assert.match(plugin, /openOutputStream\(target, "w"\)/);
  assert.match(plugin, /output\.write\(content\.getBytes\(StandardCharsets\.UTF_8\)\)/);
  assert.match(plugin, /put\("saved", true\)/);
  assert.match(app, /if \(hasAndroidDeviceBridge\(\)\)/);
  assert.match(app, /已取消保存，没有写入文件/);
});

test("calendar permission is requested only from its explicit feature screen", () => {
  assert.match(app, /requestNativeCalendarAccess\(mode\)/);
  assert.match(app, /只在这里点授权时请求/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /打开系统确认页/);
  assert.match(app, /直接写入所选日历/);
  assert.match(app, /伙伴只会读取你勾选的日历/);
  assert.match(app, /去系统设置开启/);
  assert.match(plugin, /PermissionState\.DENIED.*return "blocked"/s);
});

test("Health remains an honest separate capability until Health Connect exists", () => {
  assert.match(app, /Health Connect 尚未接入这版 APK/);
  assert.match(app, /它不会跳去模型\s*API/);
});

test("Android direct setup uses reviewed provider and model choices before advanced custom input", () => {
  for (const [id, label] of [["deepseek", "DeepSeek"], ["glm", "智谱 GLM"], ["qwen", "通义千问"], ["kimi", "Kimi"], ["openrouter", "OpenRouter"]]) {
    assert.match(app, new RegExp(`id:\\s*"${id}"[\\s\\S]{0,100}?label:\\s*"${label}"`));
  }
  assert.match(app, /<label>\s*供应商\s*<select/);
  assert.match(app, /<label>\s*模型[\s\S]{0,100}?nativePreset[\s\S]{0,100}?<select/);
  assert.match(app, /自定义兼容接口（高级）/);
  assert.match(app, /!nativePreset[\s\S]{0,80}?<label>\s*兼容接口地址/);
  assert.match(app, /recognizeProviderPaste/);
  assert.match(app, /Key 前缀无法唯一判断供应商/);
  assert.match(app, /这是 Gemini 凭据/);
});

test("Android direct chat exposes the same bounded local room hand as relay chat", () => {
  assert.match(nativeGateway, /write_room_entry/);
  assert.match(nativeGateway, /put\("whisper"\)/);
  assert.match(nativeGateway, /create_toy/);
  assert.match(nativeGateway, /update_toy/);
  assert.match(voicePanel, /ENABLED_CLIENT_TOOLS/);
});

test("Android phone keeps voice keys in a separate Keystore bridge", () => {
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
  assert.match(manifest, /android\.permission\.MODIFY_AUDIO_SETTINGS/);
  assert.match(activity, /registerPlugin\(FuyueVoicePlugin\.class\)/);
  for (const method of ["configure", "getStatus", "clear", "requestMicrophone", "transcribe", "synthesize", "startLiveCall", "appendLiveAudio", "commitLiveAudio", "cancelLiveResponse", "speakLiveText", "setLiveMuted", "stopLiveCall"]) {
    assert.match(voicePlugin, new RegExp(`public void ${method}\\(PluginCall call\\)`));
  }
  assert.match(voicePlugin, /AndroidKeyStore/);
  assert.match(voicePlugin, /PROFILE_SEPARATOR/);
  assert.match(voicePlugin, /preserveLegacyProfile\(prefs, editor\)/);
  assert.match(voicePlugin, /requestedProvider\(call, prefs\)/);
  assert.match(voicePlugin, /result\.put\("providers", providers\)/);
  assert.match(voicePlugin, /ElevenLabs/);
  assert.match(voicePlugin, /豆包/);
  assert.match(voicePlugin, /input_audio_buffer\.append/);
  assert.match(voicePlugin, /conversation\.item\.input_audio_transcription\.started/);
  assert.match(voicePlugin, /response\.cancel/);
  assert.match(voicePlugin, /response\.output_audio\.delta/);
  assert.match(voicePlugin, /speech_text_buffer\.commit/);
  assert.match(voicePlugin, /AudioTrack/);
  assert.match(voicePlugin, /notifyListeners\("liveCallEvent"/);
  assert.match(voicePanel, /Android Keystore/);
  assert.match(voicePanel, /clearNativeVoice/);
  assert.doesNotMatch(voicePanel, /\[温柔地说\]\[叹气\]/);
  assert.match(voicePanel, /prepareElevenV3Speech/);
  assert.match(voicePanel, /speechDelivery: "eleven_v3_audio_tags"/);
  assert.doesNotMatch(voicePanel, /voiceStyles|fuyue-public-voice-style/);
  assert.match(nativeGateway, /eleven_v3_audio_tags/);
  assert.match(nativeGateway, /\[softly\].*\[sighs\]/s);
});

test("PWA and iOS use the relay Web Audio duplex transport while Android keeps its native transport", () => {
  assert.match(voicePanel, /if \(nativeAvailable\) await startNativeFullDuplex\(\); else await startBrowserFullDuplex\(\)/);
  assert.match(voicePanel, /Boolean\(relayUrl\)/);
  assert.match(browserLiveCall, /getUserMedia/);
  assert.match(browserLiveCall, /echoCancellation: true/);
  assert.match(browserLiveCall, /\/v1\/voice\/live/);
  assert.match(browserLiveCall, /session\.sources\.forEach[\s\S]*?source\.stop\(\)/);
  assert.match(browserLiveCall, /now - session\.bargeAt >= 200/);
  assert.match(browserLiveCall, /session\.discardAudio = true/);
  assert.match(browserLiveCall, /encoded && !session\.discardAudio/);
  assert.match(browserLiveCall, /session\.awaitingNewPlayback = true/);
  assert.match(browserLiveCall, /fuyue-session\.\$\{sessionToken\}/);
  assert.match(voicePlugin, /elevenLabsSpeechText/);
  assert.match(voicePlugin, /startsWith\("eleven_v3"\)/);
  assert.match(browserLiveCall, /response\.cancel/);
  assert.match(browserLiveCall, /speech_text_buffer\.commit/);
  assert.match(voicePanel, /modelReply\(text, userMessage\.id, controller, false\)/);
  assert.match(voicePanel, /memories\.filter\(\(memory\) => memory\.injectionEnabled\)/);
  assert.match(voicePanel, /history: currentCallHistory\(callTurnsRef\.current\)/);
  assert.doesNotMatch(voicePanel, /history: recentHistory\(messages\)/);
  assert.match(voicePanel, /calendarContext: calendarItems/);
  assert.match(voicePanel, /executeClientActions/);
});
