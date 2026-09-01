import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CLIENT_TOOL_NAMES } from "../../packages/core/dist/index.js";

const manifest = await readFile(new URL("../../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
const activity = await readFile(new URL("../../android/app/src/main/java/love/fuyue/phone/MainActivity.java", import.meta.url), "utf8");
const gateway = await readFile(new URL("../../android/app/src/main/java/love/fuyue/phone/FuyueNativeGatewayPlugin.java", import.meta.url), "utf8");
const voice = await readFile(new URL("../../android/app/src/main/java/love/fuyue/phone/FuyueVoicePlugin.java", import.meta.url), "utf8");
const webGateway = await readFile(new URL("../../apps/web/src/native-gateway.ts", import.meta.url), "utf8");
const webClientTools = await readFile(new URL("../../apps/web/src/client-tools.ts", import.meta.url), "utf8");
const relayServer = await readFile(new URL("../../apps/relay/src/server.ts", import.meta.url), "utf8");
const relayContract = await readFile(new URL("../../docs/RELAY_API_CONTRACT.md", import.meta.url), "utf8");
const config = await readFile(new URL("../../capacitor.config.ts", import.meta.url), "utf8");

test("Android shell keeps network and backup boundaries explicit", () => {
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
  assert.match(config, /androidScheme: "https"/);
  assert.match(config, /allowMixedContent: false/);
  assert.match(activity, /removeStaleNativeServiceWorker\(\)/);
  assert.match(activity, /addWebViewListener\(new WebViewListener\(\)/);
  assert.match(activity, /clearCache\(true\)/);
  assert.match(activity, /registration=>registration\.unregister\(\)/);
  assert.match(activity, /key\.startsWith\('fuyue-shell-'\)/);
});

test("Android registers a native provider-key gateway", () => {
  assert.match(activity, /registerPlugin\(FuyueNativeGatewayPlugin\.class\)/);
  assert.match(gateway, /AndroidKeyStore/);
  assert.match(gateway, /AES\/GCM\/NoPadding/);
  assert.match(gateway, /"https"\.equalsIgnoreCase\(url\.getProtocol\(\)\)/);
  assert.match(gateway, /Authorization", "Bearer " \+ apiKey/);
  assert.doesNotMatch(gateway, /result\.put\("apiKey"/);
});

test("Android direct chat receives the same reviewed continuity inputs", () => {
  assert.match(gateway, /call\.getArray\("history"/);
  assert.match(gateway, /call\.getArray\("people"/);
  assert.match(gateway, /call\.getArray\("memories"/);
  assert.match(gateway, /appendHistory\(messages, history\)/);
  assert.match(gateway, /buildingToy[\s\S]*32768/);
  assert.match(gateway, /finish_reason/);
  assert.match(gateway, /半截内容没有入账/);
});

test("Android side back is offered to the Fuyue history stack before the activity exits", () => {
  assert.match(activity, /OnBackPressedCallback/);
  assert.match(activity, /window\.__fuyueHandleNativeBack/);
  assert.match(activity, /if \("true"\.equals\(consumed\)\) return/);
  assert.match(activity, /再滑一次回桌面/);
  assert.match(activity, /finishAfterTransition\(\)/);
});

test("Android direct chat forwards reasoning and only the reviewed client tools", () => {
  assert.match(gateway, /call\.getString\("reasoningEffort", "auto"\)/);
  assert.match(gateway, /call\.getArray\("enabledTools"/);
  const allowlistBody = gateway.match(/private boolean isClientTool\(String name\) \{([\s\S]*?)\n    \}/)?.[1] || "";
  const androidToolNames = [...allowlistBody.matchAll(/"([^"]+)"\.equals\(name\)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(androidToolNames)].sort(), [...CLIENT_TOOL_NAMES].sort());
  assert.match(gateway, /call\.getArray\("roomContext"/);
  assert.match(gateway, /result\.put\("clientActions", actions\)/);
});

test("web, relay, Android and the public contract share one complete client-tool list", () => {
  assert.match(webClientTools, /ENABLED_CLIENT_TOOLS[^=]*= \[\.\.\.CLIENT_TOOL_NAMES\]/);
  assert.match(relayServer, /item\.enabledTools\.every\(isClientToolName\)/);
  const documentedList = relayContract.match(/"enabledTools": \[([^\]]+)\]/)?.[1] || "";
  const documentedToolNames = [...documentedList.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(documentedToolNames, [...CLIENT_TOOL_NAMES]);
});

test("Android DeepSeek direct mode offers real request-level model choices", () => {
  assert.match(webGateway, /id: "android-deepseek-flash"/);
  assert.match(webGateway, /id: "android-deepseek-pro"/);
  assert.match(gateway, /call\.getString\("providerId", "android-native"\)/);
  assert.match(gateway, /"android-deepseek-flash"\.equals\(providerId\).*return "deepseek-v4-flash"/);
  assert.match(gateway, /"android-deepseek-pro"\.equals\(providerId\).*return "deepseek-v4-pro"/);
});

test("Android full-duplex interruption invalidates queued speech before acknowledging the new turn", () => {
  assert.match(voice, /private long liveAudioGeneration/);
  assert.match(voice, /MediaRecorder\.AudioSource\.VOICE_COMMUNICATION/);
  assert.match(voice, /AcousticEchoCanceler\.isAvailable\(\)/);
  assert.match(voice, /NoiseSuppressor\.isAvailable\(\)/);
  assert.match(voice, /captureLiveAudio\(socket, activeRecorder\)/);
  assert.match(voice, /input_audio_buffer\.append/);
  assert.match(voice, /liveSpeechFrames >= 2[\s\S]*?liveResponseActive = false; livePlaybackActive = false; interrupt = true;[\s\S]*?if \(!interrupt\) return;[\s\S]*?discardLiveAudio\(\);[\s\S]*?socket\.send\(new JSONObject\(\)\.put\("type", "response\.cancel"\)/);
  assert.match(voice, /generation != liveAudioGeneration \|\| track != liveTrack/);
  assert.match(voice, /liveResponseActive && !encoded\.isEmpty\(\)/);
  assert.match(voice, /interruptPlaybackOnLocalSpeech\(socket, audio\)/);
  assert.match(voice, /rms >= 700\.0 && peak >= 2_500/);
  assert.match(voice, /liveSpeechFrames >= 2/);
  assert.match(voice, /!liveResponseActive && !livePlaybackActive/);
  assert.match(voice, /setLiveMuted/);
  assert.match(voice, /speakLiveText/);
  assert.match(voice, /speech_text_buffer\.commit/);
  assert.match(webGateway, /setNativeLiveMuted/);
  assert.match(webGateway, /speakNativeLiveText/);
  assert.match(voice, /emitLive\("turn_canceled"/);
  assert.doesNotMatch(voice, /FuyueVAD|liveDebugFrames/);
});
