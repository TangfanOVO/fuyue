package love.fuyue.phone;

import android.Manifest;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.NoiseSuppressor;
import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

@CapacitorPlugin(
    name = "FuyueVoice",
    permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class FuyueVoicePlugin extends Plugin {
    private static final String PREFS = "fuyue_voice_gateway";
    private static final String KEY_ALIAS = "fuyue_voice_key_v1";
    private static final String KEY_CIPHERTEXT = "voice_api_key";
    private static final String KEY_PROVIDER = "voice_provider";
    private static final String KEY_VOICE = "voice_id";
    private static final String KEY_MODEL = "voice_model";
    private static final String KEY_ENDPOINT = "voice_endpoint";
    private static final String KEY_STT_ENDPOINT = "voice_stt_endpoint";
    private static final String KEY_TTS_ENDPOINT = "voice_tts_endpoint";
    private static final String PROFILE_SEPARATOR = ".profile.";
    private static final int MAX_AUDIO_BYTES = 2_400_000;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final ExecutorService audioInput = Executors.newSingleThreadExecutor();
    private final ExecutorService audioOutput = Executors.newSingleThreadExecutor();
    private final OkHttpClient sockets = new OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(0, TimeUnit.MILLISECONDS).build();
    private final Object liveLock = new Object();
    private volatile WebSocket liveSocket;
    private volatile boolean liveReady;
    private volatile boolean liveResponseActive;
    private volatile boolean livePlaybackActive;
    private volatile boolean liveCaptureActive;
    private volatile boolean liveMuted;
    private volatile boolean suppressProviderCancel;
    private volatile PluginCall liveStartCall;
    private AudioRecord liveRecorder;
    private AcousticEchoCanceler liveEchoCanceler;
    private NoiseSuppressor liveNoiseSuppressor;
    private AudioTrack liveTrack;
    private long liveAudioGeneration = 0L;
    private int liveSpeechFrames = 0;
    private int previousAudioMode = AudioManager.MODE_NORMAL;

    private SharedPreferences preferences() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private JSObject publicState(SharedPreferences prefs) {
        String active = prefs.getString(KEY_PROVIDER, "elevenlabs");
        if (!configuredFor(prefs, active)) {
            if (configuredFor(prefs, "elevenlabs")) active = "elevenlabs";
            else if (configuredFor(prefs, "doubao")) active = "doubao";
            else if (configuredFor(prefs, "custom")) active = "custom";
        }
        JSArray providers = new JSArray();
        for (String item : new String[] { "elevenlabs", "doubao", "custom" }) {
            if (!configuredFor(prefs, item)) continue;
            JSObject provider = new JSObject(); provider.put("id", item); provider.put("label", providerLabel(item)); provider.put("configured", true);
            provider.put("voice", profileValue(prefs, KEY_VOICE, item, "")); provider.put("model", profileValue(prefs, KEY_MODEL, item, defaultModel(item))); providers.put(provider);
        }
        boolean configured = providers.length() > 0;
        JSObject result = new JSObject(); result.put("ok", configured); result.put("service", "Android Keystore 语音直连"); result.put("providers", providers);
        result.put("activeProviderId", configured ? active : ""); result.put("configured", configured); result.put("provider", active); result.put("providerLabel", providerLabel(active));
        result.put("voice", profileValue(prefs, KEY_VOICE, active, "")); result.put("model", profileValue(prefs, KEY_MODEL, active, defaultModel(active)));
        result.put("microphone", publicPermissionState(getPermissionState("microphone"))); return result;
    }

    private String profileKey(String base, String provider) { return base + PROFILE_SEPARATOR + provider; }
    private void preserveLegacyProfile(SharedPreferences prefs, SharedPreferences.Editor editor) {
        if (!prefs.contains(KEY_CIPHERTEXT)) return;
        String legacyProvider = prefs.getString(KEY_PROVIDER, "elevenlabs");
        if (prefs.contains(profileKey(KEY_CIPHERTEXT, legacyProvider))) return;
        editor.putString(profileKey(KEY_CIPHERTEXT, legacyProvider), prefs.getString(KEY_CIPHERTEXT, ""));
        editor.putString(profileKey(KEY_VOICE, legacyProvider), prefs.getString(KEY_VOICE, ""));
        editor.putString(profileKey(KEY_MODEL, legacyProvider), prefs.getString(KEY_MODEL, defaultModel(legacyProvider)));
        editor.putString(profileKey(KEY_ENDPOINT, legacyProvider), prefs.getString(KEY_ENDPOINT, defaultEndpoint(legacyProvider)));
        editor.putString(profileKey(KEY_STT_ENDPOINT, legacyProvider), prefs.getString(KEY_STT_ENDPOINT, ""));
        editor.putString(profileKey(KEY_TTS_ENDPOINT, legacyProvider), prefs.getString(KEY_TTS_ENDPOINT, ""));
    }
    private boolean configuredFor(SharedPreferences prefs, String provider) { return prefs.contains(profileKey(KEY_CIPHERTEXT, provider)) || (provider.equals(prefs.getString(KEY_PROVIDER, "elevenlabs")) && prefs.contains(KEY_CIPHERTEXT)); }
    private String profileValue(SharedPreferences prefs, String base, String provider, String fallback) {
        String value = prefs.getString(profileKey(base, provider), "");
        if (!value.isEmpty()) return value;
        if (provider.equals(prefs.getString(KEY_PROVIDER, "elevenlabs"))) return prefs.getString(base, fallback);
        return fallback;
    }
    private String encryptedFor(SharedPreferences prefs, String provider) { return profileValue(prefs, KEY_CIPHERTEXT, provider, ""); }
    private String requestedProvider(PluginCall call, SharedPreferences prefs) {
        String requested = trimmed(call.getString("providerId", ""));
        if ("elevenlabs".equals(requested) || "doubao".equals(requested) || "custom".equals(requested)) return requested;
        return prefs.getString(KEY_PROVIDER, "elevenlabs");
    }
    private String languageSetupMessage(String provider) { return "doubao".equals(provider) ? "中文语音尚未配置；请在高级设置中保存豆包 Key 与声音 ID" : "elevenlabs".equals(provider) ? "English voice is not configured; add an ElevenLabs key and Voice ID in advanced settings" : "请先配置自定义语音 API"; }

    @Override
    protected void handleOnDestroy() { closeLiveCall(false); network.shutdownNow(); audioInput.shutdownNow(); audioOutput.shutdownNow(); sockets.dispatcher().executorService().shutdown(); super.handleOnDestroy(); }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(publicState(preferences()));
    }

    static String publicPermissionState(PermissionState state) {
        if (state == PermissionState.GRANTED) return "granted";
        if (state == PermissionState.DENIED || state == PermissionState.PROMPT_WITH_RATIONALE) return "denied";
        return "prompt";
    }

    @PluginMethod
    public void requestMicrophone(PluginCall call) { if (getPermissionState("microphone") == PermissionState.GRANTED) { getStatus(call); return; } requestPermissionForAlias("microphone", call, "microphoneCallback"); }

    @PermissionCallback
    public void microphoneCallback(PluginCall call) { getStatus(call); }

    @PluginMethod
    public void configure(PluginCall call) {
        String provider = trimmed(call.getString("provider", "elevenlabs")); String apiKey = trimmed(call.getString("apiKey", ""));
        String voice = trimmed(call.getString("voice", "")); String model = trimmed(call.getString("model", defaultModel(provider)));
        String endpoint = trimmed(call.getString("endpoint", defaultEndpoint(provider)));
        String sttEndpoint = trimmed(call.getString("sttEndpoint", "")); String ttsEndpoint = trimmed(call.getString("ttsEndpoint", ""));
        if (!"elevenlabs".equals(provider) && !"doubao".equals(provider) && !"custom".equals(provider)) { call.reject("只支持 ElevenLabs、豆包或自定义语音"); return; }
        if (apiKey.isEmpty()) { call.reject("请填写语音 API Key"); return; }
        if (voice.isEmpty()) { call.reject("请填写声音 Voice ID"); return; }
        if (model.isEmpty() || model.length() > 160) { call.reject("语音模型名不合法"); return; }
        if ("doubao".equals(provider) && !validSecureSocket(endpoint)) { call.reject("豆包语音地址必须使用 wss://"); return; }
        if ("custom".equals(provider) && (!validHttps(sttEndpoint) || !validHttps(ttsEndpoint))) { call.reject("自定义 STT / TTS 地址必须使用 HTTPS"); return; }
        final String savedEndpoint = endpoint;
        network.execute(() -> {
            try {
                if ("elevenlabs".equals(provider)) probeElevenLabs(apiKey);
                String encrypted = encrypt(apiKey); SharedPreferences prefs = preferences(); SharedPreferences.Editor editor = prefs.edit(); preserveLegacyProfile(prefs, editor);
                editor
                    .putString(profileKey(KEY_CIPHERTEXT, provider), encrypted).putString(profileKey(KEY_VOICE, provider), voice).putString(profileKey(KEY_MODEL, provider), model)
                    .putString(profileKey(KEY_ENDPOINT, provider), savedEndpoint).putString(profileKey(KEY_STT_ENDPOINT, provider), sttEndpoint).putString(profileKey(KEY_TTS_ENDPOINT, provider), ttsEndpoint)
                    .putString(KEY_CIPHERTEXT, encrypted).putString(KEY_PROVIDER, provider).putString(KEY_VOICE, voice).putString(KEY_MODEL, model).putString(KEY_ENDPOINT, savedEndpoint).putString(KEY_STT_ENDPOINT, sttEndpoint).putString(KEY_TTS_ENDPOINT, ttsEndpoint).apply();
                call.resolve(publicState(preferences()));
            } catch (Exception error) { call.reject(safeMessage(error, "语音 Key 没有通过验证")); }
        });
    }

    @PluginMethod
    public void clear(PluginCall call) { preferences().edit().clear().apply(); call.resolve(); }

    @PluginMethod
    public void startLiveCall(PluginCall call) {
        SharedPreferences prefs = preferences(); String provider = requestedProvider(call, prefs);
        if (!"doubao".equals(provider)) { call.reject("当前只有中文豆包路径达到端到端全双工；English 仍是实时转写与分段合成兼容链路"); return; }
        if (getPermissionState("microphone") != PermissionState.GRANTED) { call.reject("没有麦克风权限，实时电话没有开始"); return; }
        String encrypted = encryptedFor(prefs, provider); if (encrypted.isEmpty()) { call.reject(languageSetupMessage(provider)); return; }
        String instructions = trimmed(call.getString("instructions", ""));
        if (instructions.length() > 10_000) { call.reject("电话上下文超过豆包会话限制"); return; }
        synchronized (liveLock) {
            if (liveSocket != null) { call.reject("已有一通实时电话正在进行"); return; }
            liveReady = false; liveResponseActive = false; livePlaybackActive = false; liveCaptureActive = false; liveMuted = false; suppressProviderCancel = false; liveStartCall = call; call.setKeepAlive(true);
        }
        try {
            String key = decrypt(encrypted);
            Request request = new Request.Builder().url(profileValue(prefs, KEY_ENDPOINT, "doubao", defaultEndpoint("doubao"))).addHeader("X-Api-Key", key).build();
            WebSocket socket = sockets.newWebSocket(request, new WebSocketListener() {
                @Override public void onOpen(WebSocket opened, Response response) {
                    synchronized (liveLock) { liveSocket = opened; }
                    try { if (!opened.send(doubaoSession(prefs, instructions).toString())) failLiveStart("豆包实时会话没有接收初始化请求"); }
                    catch (Exception problem) { failLiveStart("豆包实时会话初始化失败"); }
                }
                @Override public void onMessage(WebSocket opened, String value) {
                    try { handleLiveEvent(opened, new JSONObject(value)); }
                    catch (Exception problem) { emitLive("error", new JSObject().put("message", "豆包实时语音返回了无法识别的事件")); }
                }
                @Override public void onClosed(WebSocket opened, int code, String reason) { emitLive("closed", new JSObject()); closeLiveCall(false); }
                @Override public void onFailure(WebSocket opened, Throwable problem, Response response) {
                    if (!liveReady) failLiveStart(response == null ? "豆包实时语音无法连接" : "豆包实时语音连接被拒绝（" + response.code() + "）");
                    else emitLive("error", new JSObject().put("message", response == null ? "豆包实时语音连接中断，可以重新拨打" : "豆包实时语音连接被拒绝（" + response.code() + "）"));
                    closeLiveCall(false);
                }
            });
            synchronized (liveLock) { liveSocket = socket; }
        } catch (Exception problem) { failLiveStart(safeMessage(problem, "豆包实时语音没有开始")); closeLiveCall(false); }
    }

    @PluginMethod
    public void appendLiveAudio(PluginCall call) {
        String encoded = call.getString("audioBase64", ""); byte[] audio;
        try { audio = Base64.decode(encoded, Base64.DEFAULT); } catch (Exception problem) { call.reject("实时音频块损坏"); return; }
        WebSocket socket = liveSocket;
        if (!liveReady || socket == null) { call.reject("实时电话尚未连接"); return; }
        if (audio.length < 2 || audio.length > 65_536) { call.reject("实时音频块大小不合法"); return; }
        try {
            interruptPlaybackOnLocalSpeech(socket, audio);
            boolean accepted = socket.send(new JSONObject().put("type", "input_audio_buffer.append").put("event_id", eventId()).put("audio", Base64.encodeToString(audio, Base64.NO_WRAP)).toString());
            if (!accepted) { call.reject("实时电话发送队列已关闭"); return; }
            call.resolve();
        } catch (Exception problem) { call.reject("实时音频块没有送出"); }
    }

    @PluginMethod
    public void commitLiveAudio(PluginCall call) {
        WebSocket socket = liveSocket; if (!liveReady || socket == null) { call.reject("实时电话尚未连接"); return; }
        try { socket.send(new JSONObject().put("type", "input_audio_buffer.commit").put("event_id", eventId()).toString()); call.resolve(); }
        catch (Exception problem) { call.reject("实时电话无法强制判停"); }
    }

    @PluginMethod
    public void cancelLiveResponse(PluginCall call) {
        WebSocket socket = liveSocket; if (socket == null) { call.resolve(); return; }
        liveResponseActive = false; livePlaybackActive = false; suppressProviderCancel = true; discardLiveAudio();
        try { socket.send(new JSONObject().put("type", "response.cancel").put("event_id", eventId()).toString()); call.resolve(); }
        catch (Exception problem) { call.reject("没有成功打断这次播报"); }
    }

    @PluginMethod
    public void speakLiveText(PluginCall call) {
        WebSocket socket = liveSocket; String text = trimmed(call.getString("text", ""));
        if (!liveReady || socket == null) { call.reject("实时电话尚未连接"); return; }
        if (text.isEmpty() || text.length() > 8_000) { call.reject("这轮电话回复太长或为空"); return; }
        try {
            boolean accepted = socket.send(new JSONObject().put("type", "speech_text_buffer.commit").put("event_id", eventId()).put("speech_id", eventId()).put("text", text).toString());
            if (!accepted) { call.reject("实时语音合成队列已关闭"); return; }
            call.resolve();
        } catch (Exception problem) { call.reject("这轮文字没有送进实时声音"); }
    }

    @PluginMethod
    public void setLiveMuted(PluginCall call) {
        synchronized (liveLock) { liveMuted = call.getBoolean("muted", false); }
        call.resolve();
    }

    @PluginMethod
    public void stopLiveCall(PluginCall call) { closeLiveCall(true); call.resolve(); }

    @PluginMethod
    public void transcribe(PluginCall call) {
        SharedPreferences prefs = preferences(); String provider = requestedProvider(call, prefs); String encrypted = encryptedFor(prefs, provider); if (encrypted.isEmpty()) { call.reject(languageSetupMessage(provider)); return; }
        String encoded = call.getString("audioBase64", ""); byte[] audio;
        try { audio = Base64.decode(encoded, Base64.DEFAULT); } catch (Exception error) { call.reject("录音数据损坏"); return; }
        if (audio.length < 1_600 || audio.length > MAX_AUDIO_BYTES) { call.reject("录音太短或超过 75 秒"); return; }
        network.execute(() -> {
            try {
                String key = decrypt(encrypted); String text;
                if ("elevenlabs".equals(provider)) text = transcribeElevenLabs(key, audio);
                else if ("doubao".equals(provider)) text = transcribeDoubao(key, prefs, audio);
                else text = transcribeCustom(key, prefs, encoded);
                if (text.isEmpty()) throw new Exception("这次没有听清，再说一次试试");
                JSObject result = new JSObject(); result.put("text", text); result.put("providerId", provider); result.put("providerLabel", providerLabel(provider)); call.resolve(result);
            } catch (Exception error) { call.reject(safeMessage(error, "这次语音没有转写成功")); }
        });
    }

    @PluginMethod
    public void synthesize(PluginCall call) {
        SharedPreferences prefs = preferences(); String provider = requestedProvider(call, prefs); String encrypted = encryptedFor(prefs, provider); if (encrypted.isEmpty()) { call.reject(languageSetupMessage(provider)); return; }
        String text = trimmed(call.getString("text", "")); if (text.isEmpty() || text.length() > 4_000) { call.reject("要播放的文字不合法"); return; }
        network.execute(() -> {
            try {
                String key = decrypt(encrypted); AudioResult audio;
                if ("elevenlabs".equals(provider)) audio = synthesizeElevenLabs(key, prefs, text);
                else if ("doubao".equals(provider)) audio = synthesizeDoubao(key, prefs, text);
                else audio = synthesizeCustom(key, prefs, text);
                JSObject result = new JSObject(); result.put("audioBase64", Base64.encodeToString(audio.bytes, Base64.NO_WRAP)); result.put("mediaType", audio.mediaType); result.put("providerId", provider); result.put("providerLabel", providerLabel(provider)); call.resolve(result);
            } catch (Exception error) { call.reject(safeMessage(error, "这次语音没有合成成功")); }
        });
    }

    private void probeElevenLabs(String apiKey) throws Exception {
        HttpsURLConnection connection = https("https://api.elevenlabs.io/v1/voices", "GET"); connection.setRequestProperty("xi-api-key", apiKey);
        int status = connection.getResponseCode(); if (status < 200 || status >= 300) throw new Exception(httpError(connection, status)); connection.disconnect();
    }

    private String transcribeElevenLabs(String apiKey, byte[] audio) throws Exception {
        HttpsURLConnection tokenRequest = https("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", "POST"); tokenRequest.setRequestProperty("xi-api-key", apiKey);
        int status = tokenRequest.getResponseCode(); if (status < 200 || status >= 300) throw new Exception(httpError(tokenRequest, status));
        String token = new JSONObject(readText(tokenRequest.getInputStream())).optString("token", ""); tokenRequest.disconnect(); if (token.isEmpty()) throw new Exception("ElevenLabs 没有返回临时语音凭据");
        String url = "wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_16000&commit_strategy=manual&token=" + URLEncoder.encode(token, "UTF-8");
        return websocketText(new Request.Builder().url(url).build(), socket -> {
            List<byte[]> parts = chunks(audio, 16_000); for (int index = 0; index < parts.size(); index++) { JSONObject message = new JSONObject().put("message_type", "input_audio_chunk").put("audio_base_64", Base64.encodeToString(parts.get(index), Base64.NO_WRAP)).put("sample_rate", 16000); if (index == parts.size() - 1) message.put("commit", true); socket.send(message.toString()); }
        }, (event, result, error, socket) -> {
            String type = event.optString("message_type", "");
            if ("committed_transcript".equals(type)) { String text = event.optString("text", "").trim(); if (!text.isEmpty()) { result.set(text); socket.close(1000, "done"); } else error.set(new Exception("这次没有听清")); }
            else if (type.endsWith("error") || "quota_exceeded".equals(type) || "rate_limited".equals(type)) error.set(new Exception(event.optString("error", event.optString("message", "ElevenLabs 转写失败"))));
        });
    }

    private String transcribeDoubao(String apiKey, SharedPreferences prefs, byte[] audio) throws Exception {
        Request request = new Request.Builder().url(profileValue(prefs, KEY_ENDPOINT, "doubao", defaultEndpoint("doubao"))).addHeader("X-Api-Key", apiKey).build();
        return websocketText(request, socket -> socket.send(doubaoSession(prefs).toString()), (event, result, error, socket) -> {
            String type = event.optString("type", "");
            if ("session.created".equals(type)) { for (byte[] part : chunks(audio, 16_000)) socket.send(new JSONObject().put("type", "input_audio_buffer.append").put("event_id", eventId()).put("audio", Base64.encodeToString(part, Base64.NO_WRAP)).toString()); socket.send(new JSONObject().put("type", "input_audio_buffer.commit").put("event_id", eventId()).toString()); }
            else if ("conversation.item.input_audio_transcription.completed".equals(type)) { String text = event.optString("transcript", event.optString("text", "")).trim(); if (!text.isEmpty()) { result.set(text); socket.close(1000, "done"); } else error.set(new Exception("这次没有听清")); }
            else if ("conversation.item.input_audio_transcription.failed".equals(type) || "error".equals(type)) error.set(new Exception(event.optString("message", "豆包转写失败")));
        });
    }

    private AudioResult synthesizeElevenLabs(String apiKey, SharedPreferences prefs, String text) throws Exception {
        String voice = profileValue(prefs, KEY_VOICE, "elevenlabs", ""); String model = profileValue(prefs, KEY_MODEL, "elevenlabs", defaultModel("elevenlabs"));
        String speechText = elevenLabsSpeechText(text, model);
        HttpsURLConnection connection = https("https://api.elevenlabs.io/v1/text-to-speech/" + URLEncoder.encode(voice, "UTF-8") + "/stream?output_format=mp3_44100_128", "POST");
        connection.setRequestProperty("xi-api-key", apiKey); connection.setRequestProperty("Accept", "audio/mpeg"); connection.setRequestProperty("Content-Type", "application/json");
        JSONObject body = new JSONObject().put("text", speechText).put("model_id", model); if (speechText.matches(".*[\\u3400-\\u9fff].*")) body.put("language_code", "zh");
        try (OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        int status = connection.getResponseCode(); if (status < 200 || status >= 300) throw new Exception(httpError(connection, status)); byte[] bytes = readBytes(connection.getInputStream(), 8_000_000); connection.disconnect(); if (bytes.length < 512) throw new Exception("ElevenLabs 返回的语音不完整"); return new AudioResult(bytes, "audio/mpeg");
    }

    private String elevenLabsSpeechText(String text, String model) {
        if (model != null && model.trim().toLowerCase().startsWith("eleven_v3")) return text.trim();
        return text.replaceAll("\\[[^\\[\\]\\r\\n]{1,80}\\]|【[^【】\\r\\n]{1,80}】", " ").replaceAll("[ \\t]{2,}", " ").trim();
    }

    private AudioResult synthesizeDoubao(String apiKey, SharedPreferences prefs, String text) throws Exception {
        Request request = new Request.Builder().url(profileValue(prefs, KEY_ENDPOINT, "doubao", defaultEndpoint("doubao"))).addHeader("X-Api-Key", apiKey).build(); CountDownLatch latch = new CountDownLatch(1); AtomicReference<Exception> error = new AtomicReference<>(); List<byte[]> parts = new ArrayList<>();
        WebSocket socket = sockets.newWebSocket(request, new WebSocketListener() {
            @Override public void onOpen(WebSocket socket, Response response) { try { socket.send(doubaoSession(prefs).toString()); } catch (Exception problem) { error.set(problem); latch.countDown(); } }
            @Override public void onMessage(WebSocket socket, String value) { try { JSONObject event = new JSONObject(value); String type = event.optString("type", ""); if ("session.created".equals(type)) socket.send(new JSONObject().put("type", "speech_text_buffer.commit").put("event_id", eventId()).put("speech_id", eventId()).put("text", text).toString()); else if ("response.output_audio.delta".equals(type)) { String encoded = event.optString("delta", ""); if (!encoded.isEmpty()) parts.add(Base64.decode(encoded, Base64.DEFAULT)); } else if ("response.output_audio.done".equals(type)) { socket.close(1000, "done"); latch.countDown(); } else if ("error".equals(type)) { error.set(new Exception(event.optString("message", "豆包语音合成失败"))); latch.countDown(); } } catch (Exception problem) { error.set(problem); latch.countDown(); } }
            @Override public void onFailure(WebSocket socket, Throwable problem, Response response) { error.set(new Exception(problem.getMessage() == null ? "豆包语音无法连接" : problem.getMessage())); latch.countDown(); }
        });
        if (!latch.await(55, TimeUnit.SECONDS)) { socket.cancel(); throw new Exception("豆包语音等待超时"); } if (error.get() != null) throw error.get(); ByteArrayOutputStream pcm = new ByteArrayOutputStream(); for (byte[] part : parts) pcm.write(part); byte[] bytes = pcm.toByteArray(); if (bytes.length < 512) throw new Exception("豆包返回的语音不完整"); return new AudioResult(wav(bytes, 24000), "audio/wav");
    }

    private String transcribeCustom(String apiKey, SharedPreferences prefs, String audioBase64) throws Exception { JSONObject response = postJson(profileValue(prefs, KEY_STT_ENDPOINT, "custom", ""), apiKey, new JSONObject().put("audioBase64", audioBase64).put("sampleRate", 16000).put("encoding", "pcm_s16le")); return response.optString("text", response.optString("transcript", "")).trim(); }
    private AudioResult synthesizeCustom(String apiKey, SharedPreferences prefs, String text) throws Exception { JSONObject response = postJson(profileValue(prefs, KEY_TTS_ENDPOINT, "custom", ""), apiKey, new JSONObject().put("text", text).put("voice", profileValue(prefs, KEY_VOICE, "custom", "default")).put("model", profileValue(prefs, KEY_MODEL, "custom", "default"))); String encoded = response.optString("audioBase64", ""); if (encoded.isEmpty()) throw new Exception("自定义语音服务没有返回音频"); return new AudioResult(Base64.decode(encoded, Base64.DEFAULT), "audio/wav".equals(response.optString("mediaType")) ? "audio/wav" : "audio/mpeg"); }

    private JSONObject postJson(String url, String apiKey, JSONObject body) throws Exception { HttpsURLConnection connection = https(url, "POST"); connection.setRequestProperty("Authorization", "Bearer " + apiKey); connection.setRequestProperty("Content-Type", "application/json"); try (OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); } int status = connection.getResponseCode(); if (status < 200 || status >= 300) throw new Exception(httpError(connection, status)); JSONObject result = new JSONObject(readText(connection.getInputStream())); connection.disconnect(); return result; }

    private String websocketText(Request request, SocketOpened opened, SocketEvent received) throws Exception {
        CountDownLatch latch = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>(""); AtomicReference<Exception> error = new AtomicReference<>();
        WebSocket socket = sockets.newWebSocket(request, new WebSocketListener() {
            @Override public void onOpen(WebSocket socket, Response response) { try { opened.run(socket); } catch (Exception problem) { error.set(problem); latch.countDown(); } }
            @Override public void onMessage(WebSocket socket, String value) { try { received.run(new JSONObject(value), result, error, socket); if (!result.get().isEmpty() || error.get() != null) latch.countDown(); } catch (Exception problem) { error.set(problem); latch.countDown(); } }
            @Override public void onFailure(WebSocket socket, Throwable problem, Response response) { error.set(new Exception(problem.getMessage() == null ? "语音服务无法连接" : problem.getMessage())); latch.countDown(); }
        });
        if (!latch.await(55, TimeUnit.SECONDS)) { socket.cancel(); throw new Exception("语音服务等待超时"); } if (error.get() != null) { socket.cancel(); throw error.get(); } return result.get();
    }

    private void handleLiveEvent(WebSocket socket, JSONObject event) throws Exception {
        String type = event.optString("type", "");
        if ("session.created".equals(type)) {
            enterCommunicationMode();
            try { startLiveCapture(socket); }
            catch (Exception problem) { failLiveStart("这台手机没有打开可全双工的原生麦克风"); closeLiveCall(false); return; }
            liveReady = true; PluginCall start = liveStartCall; liveStartCall = null;
            if (start != null) { start.setKeepAlive(false); JSObject result = new JSObject(); result.put("ok", true); result.put("providerId", "doubao"); result.put("providerLabel", "豆包 Seeduplex"); result.put("model", "1.2.6.1"); result.put("mode", "end_to_end_full_duplex"); start.resolve(result); }
            emitLive("connected", new JSObject().put("providerLabel", "豆包 Seeduplex").put("model", "1.2.6.1")); return;
        }
        if ("conversation.item.input_audio_transcription.started".equals(type)) {
            if (liveResponseActive || livePlaybackActive) { liveResponseActive = false; livePlaybackActive = false; suppressProviderCancel = true; discardLiveAudio(); socket.send(new JSONObject().put("type", "response.cancel").put("event_id", eventId()).toString()); }
            emitLive("transcription_started", new JSObject()); return;
        }
        if ("conversation.item.input_audio_transcription.delta".equals(type)) { emitLive("transcript_delta", textEvent(event)); return; }
        if ("conversation.item.input_audio_transcription.completed".equals(type)) {
            suppressProviderCancel = true; try { socket.send(new JSONObject().put("type", "response.cancel").put("event_id", eventId()).toString()); } catch (Exception ignored) {}
            emitLive("transcript_completed", textEvent(event)); return;
        }
        if ("conversation.item.input_audio_transcription.failed".equals(type)) { emitLive("turn_error", new JSObject().put("message", "豆包这轮没有完成实时识别，可以直接重说")); return; }
        if ("response.output_text.delta".equals(type)) { emitLive("reply_delta", textEvent(event)); return; }
        if ("response.output_text.done".equals(type)) { emitLive("reply_completed", textEvent(event)); return; }
        if ("response.output_audio.started".equals(type)) { synchronized (liveLock) { liveResponseActive = true; livePlaybackActive = true; liveSpeechFrames = 0; } ensureLiveTrack(); emitLive("audio_started", new JSObject()); return; }
        if ("response.output_audio.delta".equals(type)) {
            String encoded = event.optString("delta", event.optString("audio", "")); if (liveResponseActive && !encoded.isEmpty()) playLiveAudio(Base64.decode(encoded, Base64.DEFAULT)); return;
        }
        if ("response.output_audio.done".equals(type)) { synchronized (liveLock) { liveResponseActive = false; liveSpeechFrames = 0; } emitLive("audio_completed", new JSObject()); return; }
        if ("response.done".equals(type)) { synchronized (liveLock) { liveResponseActive = false; liveSpeechFrames = 0; } emitLive("turn_completed", new JSObject()); return; }
        if ("response.canceled".equals(type)) {
            boolean suppress = suppressProviderCancel; suppressProviderCancel = false;
            synchronized (liveLock) { liveResponseActive = false; livePlaybackActive = false; liveSpeechFrames = 0; }
            discardLiveAudio(); if (!suppress) emitLive("turn_canceled", new JSObject()); return;
        }
        if ("session.closed".equals(type)) { emitLive("closed", new JSObject()); closeLiveCall(false); return; }
        if ("error".equals(type)) {
            String code = event.optString("code", event.optString("status_code", "unknown"));
            emitLive("error", new JSObject().put("message", "豆包实时语音拒绝了会话（" + code.replaceAll("[^0-9A-Za-z_-]", "") + "）"));
            closeLiveCall(false);
        }
    }

    private JSObject textEvent(JSONObject event) {
        String text = event.optString("delta", event.optString("transcript", event.optString("text", "")));
        JSObject result = new JSObject(); result.put("text", text); result.put("itemId", event.optString("item_id", "")); return result;
    }

    private void emitLive(String eventType, JSObject details) { details.put("eventType", eventType); notifyListeners("liveCallEvent", details); }

    private void failLiveStart(String message) {
        PluginCall start = liveStartCall; liveStartCall = null;
        if (start != null) { start.setKeepAlive(false); start.reject(message); }
        else emitLive("error", new JSObject().put("message", message));
    }

    private void enterCommunicationMode() {
        AudioManager manager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (manager == null) return; previousAudioMode = manager.getMode(); manager.setMode(AudioManager.MODE_IN_COMMUNICATION); manager.setSpeakerphoneOn(true);
    }

    private void leaveCommunicationMode() {
        AudioManager manager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (manager == null) return; manager.setSpeakerphoneOn(false); manager.setMode(previousAudioMode);
    }

    private void ensureLiveTrack() {
        synchronized (liveLock) {
            if (liveTrack != null) return;
            int minimum = AudioTrack.getMinBufferSize(24_000, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
            liveTrack = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(24_000).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setBufferSizeInBytes(Math.max(minimum, 24_000)).setTransferMode(AudioTrack.MODE_STREAM).build();
            liveTrack.play();
        }
    }

    private void playLiveAudio(byte[] audio) {
        if (audio.length == 0 || !liveResponseActive) return;
        ensureLiveTrack(); final byte[] copy = audio.clone(); final AudioTrack track; final long generation;
        synchronized (liveLock) { if (!liveResponseActive || liveTrack == null) return; track = liveTrack; generation = liveAudioGeneration; }
        audioOutput.execute(() -> {
            try {
                for (int offset = 0; offset < copy.length; offset += 2_400) {
                    synchronized (liveLock) { if (generation != liveAudioGeneration || track != liveTrack) return; }
                    if (track.getState() != AudioTrack.STATE_INITIALIZED) return;
                    int length = Math.min(2_400, copy.length - offset);
                    int written = track.write(copy, offset, length, AudioTrack.WRITE_BLOCKING);
                    if (written <= 0) return;
                }
            }
            catch (IllegalStateException ignored) { /* A barge-in may release this generation while a write is pending. */ }
        });
    }

    private boolean looksLikeLocalSpeech(byte[] audio) {
        long squares = 0L; int peak = 0; int samples = 0;
        for (int offset = 0; offset + 1 < audio.length; offset += 2) {
            int sample = (short) ((audio[offset] & 0xff) | (audio[offset + 1] << 8));
            int amplitude = Math.abs(sample); peak = Math.max(peak, amplitude); squares += (long) sample * sample; samples++;
        }
        if (samples == 0) return false;
        double rms = Math.sqrt((double) squares / samples);
        return rms >= 700.0 && peak >= 2_500;
    }

    private void interruptPlaybackOnLocalSpeech(WebSocket socket, byte[] audio) {
        boolean interrupt = false;
        synchronized (liveLock) {
            if (!liveResponseActive && !livePlaybackActive) { liveSpeechFrames = 0; return; }
            liveSpeechFrames = looksLikeLocalSpeech(audio) ? liveSpeechFrames + 1 : 0;
            if (liveSpeechFrames >= 2) { liveSpeechFrames = 0; liveResponseActive = false; livePlaybackActive = false; interrupt = true; }
        }
        if (!interrupt) return;
        discardLiveAudio();
        try { suppressProviderCancel = true; socket.send(new JSONObject().put("type", "response.cancel").put("event_id", eventId()).toString()); }
        catch (Exception ignored) { /* Local playback is already silent; the session can still hear the new speech. */ }
        emitLive("turn_canceled", new JSObject().put("message", "已在手机端听到插话并停止上一段播报"));
    }

    private void discardLiveAudio() {
        AudioTrack track;
        synchronized (liveLock) { liveAudioGeneration++; livePlaybackActive = false; track = liveTrack; liveTrack = null; }
        if (track != null) { try { track.pause(); track.flush(); track.stop(); track.release(); } catch (Exception ignored) {} }
    }

    private void startLiveCapture(WebSocket socket) throws Exception {
        int minimum = AudioRecord.getMinBufferSize(16_000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minimum <= 0) throw new IllegalStateException("invalid recorder buffer");
        AudioRecord recorder = new AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            16_000,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            Math.max(minimum * 2, 4_096)
        );
        if (recorder.getState() != AudioRecord.STATE_INITIALIZED) { recorder.release(); throw new IllegalStateException("recorder not initialized"); }
        AcousticEchoCanceler echo = null;
        NoiseSuppressor noise = null;
        try {
            if (AcousticEchoCanceler.isAvailable()) { echo = AcousticEchoCanceler.create(recorder.getAudioSessionId()); if (echo != null) echo.setEnabled(true); }
            if (NoiseSuppressor.isAvailable()) { noise = NoiseSuppressor.create(recorder.getAudioSessionId()); if (noise != null) noise.setEnabled(true); }
            recorder.startRecording();
            if (recorder.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) throw new IllegalStateException("recorder did not start");
        } catch (Exception problem) {
            if (echo != null) echo.release();
            if (noise != null) noise.release();
            try { recorder.release(); } catch (Exception ignored) {}
            throw problem;
        }
        synchronized (liveLock) {
            liveRecorder = recorder; liveEchoCanceler = echo; liveNoiseSuppressor = noise; liveCaptureActive = true;
        }
        final AudioRecord activeRecorder = recorder;
        audioInput.execute(() -> captureLiveAudio(socket, activeRecorder));
    }

    private void captureLiveAudio(WebSocket socket, AudioRecord recorder) {
        byte[] buffer = new byte[1_280];
        while (true) {
            synchronized (liveLock) { if (!liveCaptureActive || recorder != liveRecorder || socket != liveSocket) return; }
            int read;
            try { read = recorder.read(buffer, 0, buffer.length, AudioRecord.READ_BLOCKING); }
            catch (Exception ignored) { return; }
            if (read <= 0) continue;
            byte[] audio = new byte[read]; System.arraycopy(buffer, 0, audio, 0, read);
            boolean muted;
            synchronized (liveLock) { muted = liveMuted; }
            if (muted) continue;
            interruptPlaybackOnLocalSpeech(socket, audio);
            try {
                boolean accepted = socket.send(new JSONObject().put("type", "input_audio_buffer.append").put("event_id", eventId()).put("audio", Base64.encodeToString(audio, Base64.NO_WRAP)).toString());
                if (!accepted) { emitLive("error", new JSObject().put("message", "实时电话发送队列已关闭")); return; }
            } catch (Exception problem) { emitLive("error", new JSObject().put("message", "实时麦克风音频没有送出")); return; }
        }
    }

    private void stopLiveCapture() {
        AudioRecord recorder; AcousticEchoCanceler echo; NoiseSuppressor noise;
        synchronized (liveLock) {
            liveCaptureActive = false; recorder = liveRecorder; liveRecorder = null;
            echo = liveEchoCanceler; liveEchoCanceler = null; noise = liveNoiseSuppressor; liveNoiseSuppressor = null;
        }
        if (recorder != null) { try { recorder.stop(); } catch (Exception ignored) {} try { recorder.release(); } catch (Exception ignored) {} }
        if (echo != null) { try { echo.release(); } catch (Exception ignored) {} }
        if (noise != null) { try { noise.release(); } catch (Exception ignored) {} }
    }

    private void closeLiveCall(boolean notifyServer) {
        WebSocket socket; AudioTrack track; PluginCall start;
        stopLiveCapture();
        synchronized (liveLock) { socket = liveSocket; liveSocket = null; liveReady = false; liveResponseActive = false; livePlaybackActive = false; liveMuted = false; suppressProviderCancel = false; liveSpeechFrames = 0; liveAudioGeneration++; track = liveTrack; liveTrack = null; start = liveStartCall; liveStartCall = null; }
        if (socket != null) { if (notifyServer) { try { socket.send(new JSONObject().put("type", "session.close").put("event_id", eventId()).toString()); } catch (Exception ignored) {} } socket.close(1000, "done"); }
        if (track != null) { try { track.pause(); track.flush(); track.stop(); track.release(); } catch (Exception ignored) {} }
        if (start != null) { start.setKeepAlive(false); start.reject("实时电话在连接前已结束"); }
        leaveCommunicationMode();
    }

    private JSONObject doubaoSession(SharedPreferences prefs) throws Exception { return doubaoSession(prefs, "只负责语音识别与语音合成；最终回复由外部伴侣模型提供。"); }
    private JSONObject doubaoSession(SharedPreferences prefs, String instructions) throws Exception {
        String safeInstructions = "只负责语音识别与语音合成；最终回复由外部伴侣模型提供。";
        return new JSONObject().put("type", "session.create").put("event_id", eventId()).put("session", new JSONObject().put("id", eventId()).put("model", "1.2.6.1").put("instructions", safeInstructions).put("audio", new JSONObject().put("input", new JSONObject().put("format", new JSONObject().put("type", "pcm").put("rate", 16000))).put("output", new JSONObject().put("format", new JSONObject().put("type", "pcm_s16le").put("rate", 24000)).put("voice", profileValue(prefs, KEY_VOICE, "doubao", "")))).put("tools", new org.json.JSONArray())).put("extension", new JSONObject().put("asr", new JSONObject().put("extra", new JSONObject())).put("tts", new JSONObject().put("extra", new JSONObject())).put("dialog", new JSONObject().put("extra", new JSONObject().put("enable_music", false))));
    }
    private List<byte[]> chunks(byte[] audio, int size) { List<byte[]> result = new ArrayList<>(); for (int offset = 0; offset < audio.length; offset += size) { int length = Math.min(size, audio.length - offset); byte[] part = new byte[length]; System.arraycopy(audio, offset, part, 0, length); result.add(part); } return result; }
    private byte[] wav(byte[] pcm, int sampleRate) { ByteBuffer header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN); header.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36 + pcm.length).put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16).putShort((short) 1).putShort((short) 1).putInt(sampleRate).putInt(sampleRate * 2).putShort((short) 2).putShort((short) 16).put("data".getBytes(StandardCharsets.US_ASCII)).putInt(pcm.length); ByteArrayOutputStream output = new ByteArrayOutputStream(); try { output.write(header.array()); output.write(pcm); } catch (Exception ignored) {} return output.toByteArray(); }
    private String eventId() { return "event_" + java.util.UUID.randomUUID().toString().replace("-", ""); }
    private String providerLabel(String provider) { return "doubao".equals(provider) ? "豆包语音" : "custom".equals(provider) ? "自定义语音" : "ElevenLabs"; }
    private String defaultModel(String provider) { return "doubao".equals(provider) ? "1.2.6.1" : "custom".equals(provider) ? "default" : "eleven_v3"; }
    private String defaultEndpoint(String provider) { return "doubao".equals(provider) ? "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue" : ""; }
    private boolean validSecureSocket(String value) { try { URL url = new URL(value.replaceFirst("^wss", "https")); return value.startsWith("wss://") && !url.getHost().isEmpty(); } catch (Exception ignored) { return false; } }
    private boolean validHttps(String value) { try { URL url = new URL(value); return "https".equalsIgnoreCase(url.getProtocol()) && !url.getHost().isEmpty(); } catch (Exception ignored) { return false; } }
    private HttpsURLConnection https(String url, String method) throws Exception { HttpsURLConnection connection = (HttpsURLConnection) new URL(url).openConnection(); connection.setRequestMethod(method); connection.setConnectTimeout(15_000); connection.setReadTimeout(90_000); connection.setDoInput(true); if ("POST".equals(method)) connection.setDoOutput(true); return connection; }
    private String httpError(HttpsURLConnection connection, int status) {
        try { return publicHttpError(status, readText(connection.getErrorStream())); }
        catch (Exception ignored) { return publicHttpError(status, ""); }
    }
    static String publicHttpError(int status, String body) {
        String safeBody = body == null ? "" : body;
        String code = safeBody.contains("\"api_key_id_used_as_api_key\"") ? "api_key_id_used_as_api_key"
            : safeBody.contains("\"invalid_api_key\"") ? "invalid_api_key"
            : safeBody.contains("\"missing_permissions\"") ? "missing_permissions"
            : safeBody.contains("\"insufficient_permissions\"") ? "insufficient_permissions"
            : safeBody.contains("\"quota_exceeded\"") ? "quota_exceeded"
            : safeBody.contains("\"voice_not_found\"") ? "voice_not_found" : "";
        if ("api_key_id_used_as_api_key".equals(code)) return "这里填成了 API Key ID；请粘贴创建时只显示一次、以 sk_ 开头的完整 Key";
        if ("invalid_api_key".equals(code)) return "ElevenLabs 没有认出这把 Key；请检查是否复制完整、已过期、被停用或已轮换";
        if ("missing_permissions".equals(code) || "insufficient_permissions".equals(code)) return "这把 Key 缺少当前操作权限；电话需要 Voices read、Text to Speech 与 Speech to Text";
        if ("quota_exceeded".equals(code)) return "ElevenLabs 额度不足；请检查 Key 的信用额度与账户余额";
        if ("voice_not_found".equals(code)) return "ElevenLabs 找不到这个 Voice ID；请从 My Voices 重新复制";
        if (status == 400) return "语音供应商拒绝了配置（400）；请确认填写的是可调用的 API Key，并检查 Voice ID 与模型";
        if (status == 401 || status == 403) return "语音供应商拒绝了 API Key（" + status + "）；请重新创建或检查权限";
        if (status == 408 || status == 504) return "语音供应商响应超时（" + status + "）；可以稍后重试";
        if (status == 429) return "语音供应商限流或额度不足（429）；稍后重试或检查额度";
        if (status >= 500) return "语音供应商暂时不可用（" + status + "）；可以稍后重试";
        return "语音供应商拒绝了请求（" + status + "）";
    }
    private String readText(InputStream input) throws Exception { return new String(readBytes(input, 1_000_000), StandardCharsets.UTF_8); }
    private byte[] readBytes(InputStream input, int limit) throws Exception { if (input == null) return new byte[0]; ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] buffer = new byte[16_384]; int read; while ((read = input.read(buffer)) >= 0) { if (output.size() + read > limit) throw new Exception("语音供应商返回的数据过大"); output.write(buffer, 0, read); } input.close(); return output.toByteArray(); }
    private SecretKey secretKey() throws Exception { KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null); if (store.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey(); KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"); generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build()); return generator.generateKey(); }
    private String encrypt(String plain) throws Exception { Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, secretKey()); return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." + Base64.encodeToString(cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP); }
    private String decrypt(String saved) throws Exception { String[] parts = saved.split("\\.", 2); if (parts.length != 2) throw new Exception("安全存储无法读取，请重新配置语音 Key"); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP))); return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8); }
    private String trimmed(String value) { return value == null ? "" : value.trim(); }
    private String safeMessage(Exception error, String fallback) { String message = trimmed(error.getMessage()); return message.isEmpty() ? fallback : message; }
    private interface SocketOpened { void run(WebSocket socket) throws Exception; }
    private interface SocketEvent { void run(JSONObject event, AtomicReference<String> result, AtomicReference<Exception> error, WebSocket socket) throws Exception; }
    private static final class AudioResult { final byte[] bytes; final String mediaType; AudioResult(byte[] bytes, String mediaType) { this.bytes = bytes; this.mediaType = mediaType; } }
}
