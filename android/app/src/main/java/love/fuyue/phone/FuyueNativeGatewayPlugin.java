package love.fuyue.phone;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;

@CapacitorPlugin(name = "FuyueNativeGateway")
public class FuyueNativeGatewayPlugin extends Plugin {
    private static final String PREFS = "fuyue_native_gateway";
    private static final String KEY_ALIAS = "fuyue_provider_key_v1";
    private static final String KEY_CIPHERTEXT = "provider_key";
    private static final String KEY_BASE_URL = "base_url";
    private static final String KEY_MODEL = "model";
    private static final String DEFAULT_BASE_URL = "https://api.deepseek.com";
    private static final String DEFAULT_MODEL = "deepseek-v4-flash";
    private final ExecutorService network = Executors.newSingleThreadExecutor();

    private SharedPreferences preferences() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    @Override
    protected void handleOnDestroy() {
        network.shutdownNow();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        SharedPreferences prefs = preferences();
        JSObject result = new JSObject();
        result.put("configured", prefs.contains(KEY_CIPHERTEXT));
        result.put("baseUrl", prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL));
        result.put("model", prefs.getString(KEY_MODEL, DEFAULT_MODEL));
        call.resolve(result);
    }

    @PluginMethod
    public void configure(PluginCall call) {
        String apiKey = trimmed(call.getString("apiKey", ""));
        String baseUrl = normalizedHttps(call.getString("baseUrl", DEFAULT_BASE_URL));
        String model = trimmed(call.getString("model", DEFAULT_MODEL));
        if (apiKey.isEmpty()) { call.reject("请填写 API Key"); return; }
        if (baseUrl == null) { call.reject("原生直连只允许 HTTPS 供应商地址"); return; }
        if (model.isEmpty() || model.length() > 160) { call.reject("模型名称不合法"); return; }
        network.execute(() -> {
            try {
                probe(baseUrl, apiKey);
                preferences().edit().putString(KEY_CIPHERTEXT, encrypt(apiKey)).putString(KEY_BASE_URL, baseUrl).putString(KEY_MODEL, model).apply();
                JSObject result = new JSObject(); result.put("configured", true); result.put("baseUrl", baseUrl); result.put("model", model); call.resolve(result);
            } catch (Exception error) { call.reject(safeMessage(error, "无法验证这个 API 配置")); }
        });
    }

    @PluginMethod
    public void clear(PluginCall call) {
        preferences().edit().clear().apply();
        call.resolve();
    }

    @PluginMethod
    public void chat(PluginCall call) {
        SharedPreferences prefs = preferences();
        String encrypted = prefs.getString(KEY_CIPHERTEXT, "");
        if (encrypted.isEmpty()) { call.reject("请先配置原生 API 直连"); return; }
        String input = trimmed(call.getString("input", ""));
        if (input.isEmpty()) { call.reject("消息不能为空"); return; }
        if (input.length() > 20_000) { call.reject("消息太长"); return; }
        JSArray people = call.getArray("people", new JSArray());
        JSArray memories = call.getArray("memories", new JSArray());
        JSArray history = call.getArray("history", new JSArray());
        JSArray roomContext = call.getArray("roomContext", new JSArray());
        JSArray calendarContext = call.getArray("calendarContext", new JSArray());
        JSArray enabledTools = call.getArray("enabledTools", new JSArray());
        String reasoningEffort = trimmed(call.getString("reasoningEffort", "auto"));
        String speechDelivery = trimmed(call.getString("speechDelivery", ""));
        String providerId = trimmed(call.getString("providerId", "android-native"));
        String baseUrl = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL);
        String savedModel = prefs.getString(KEY_MODEL, DEFAULT_MODEL);
        String model = requestedModel(baseUrl, savedModel, providerId);
        network.execute(() -> {
            try {
                JSObject result = requestChat(baseUrl, decrypt(encrypted), model, input, history, people, memories, roomContext, calendarContext, enabledTools, reasoningEffort, speechDelivery);
                result.put("modelLabel", model); result.put("sourceLabel", "Android 原生直连"); call.resolve(result);
            } catch (Exception error) { call.reject(safeProviderMessage(error)); }
        });
    }

    private String requestedModel(String baseUrl, String savedModel, String providerId) {
        if (baseUrl.contains("api.deepseek.com")) {
            if ("android-deepseek-flash".equals(providerId)) return "deepseek-v4-flash";
            if ("android-deepseek-pro".equals(providerId)) return "deepseek-v4-pro";
        }
        return savedModel;
    }

    private void probe(String baseUrl, String apiKey) throws Exception {
        HttpsURLConnection connection = connection(baseUrl + "/models", "GET", apiKey);
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) throw new Exception(httpError(connection, status));
        connection.disconnect();
    }

    private JSObject requestChat(String baseUrl, String apiKey, String model, String input, JSArray history, JSArray people, JSArray memories, JSArray roomContext, JSArray calendarContext, JSArray enabledTools, String reasoningEffort, String speechDelivery) throws Exception {
        boolean buildingToy = containsTool(enabledTools, "create_toy") || containsTool(enabledTools, "update_toy");
        JSONObject body = new JSONObject(); body.put("model", model); body.put("stream", false); body.put("max_tokens", buildingToy ? 32768 : 4096);
        JSONArray messages = new JSONArray();
        String system = systemPrompt(people, memories, roomContext, calendarContext, speechDelivery);
        if (!system.isEmpty()) messages.put(new JSONObject().put("role", "system").put("content", system));
        appendHistory(messages, history);
        messages.put(new JSONObject().put("role", "user").put("content", input)); body.put("messages", messages);
        JSONArray tools = clientTools(enabledTools);
        if (tools.length() > 0) { body.put("tools", tools); body.put("tool_choice", "auto"); }
        if (baseUrl.contains("api.deepseek.com") && !reasoningEffort.isEmpty() && !"auto".equals(reasoningEffort)) {
            body.put("thinking", new JSONObject().put("type", "none".equals(reasoningEffort) ? "disabled" : "enabled"));
            if (!"none".equals(reasoningEffort)) body.put("reasoning_effort", reasoningEffort);
        }
        HttpsURLConnection connection = connection(baseUrl + "/chat/completions", "POST", apiKey);
        connection.setRequestProperty("Content-Type", "application/json");
        try (OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) throw new Exception(httpError(connection, status));
        JSONObject response = new JSONObject(read(connection.getInputStream()));
        JSONArray choices = response.optJSONArray("choices");
        JSONObject choice = choices == null || choices.length() == 0 ? null : choices.getJSONObject(0);
        String finishReason = choice == null ? "" : choice.optString("finish_reason", "");
        if (!finishReason.isEmpty() && !"stop".equals(finishReason) && !"tool_calls".equals(finishReason)) throw new Exception("供应商没有完整结束这次回复；半截内容没有入账");
        JSONObject message = choice == null ? null : choice.optJSONObject("message");
        String content = message == null ? "" : message.optString("content", "").trim();
        JSArray actions = new JSArray();
        JSONArray toolCalls = message == null ? null : message.optJSONArray("tool_calls");
        if (toolCalls != null) for (int index = 0; index < Math.min(4, toolCalls.length()); index++) {
            JSONObject toolCall = toolCalls.optJSONObject(index); JSONObject function = toolCall == null ? null : toolCall.optJSONObject("function");
            String name = function == null ? "" : function.optString("name", "");
            if (!isClientTool(name)) continue;
            try {
                JSONObject arguments = new JSONObject(function.optString("arguments", "{}"));
                actions.put(new JSONObject().put("id", toolCall.optString("id", "android-tool-" + index)).put("name", name).put("arguments", arguments));
            } catch (Exception ignored) { /* Invalid arguments are never forwarded to the local executor. */ }
        }
        connection.disconnect();
        if (content.isEmpty() && actions.length() > 0) content = "我已经把这件事交给小手机执行，结果会显示在这句话下面。";
        if (content.isEmpty()) throw new Exception("供应商返回了空回复");
        JSObject result = new JSObject(); result.put("content", content); result.put("clientActions", actions); return result;
    }

    private boolean isClientTool(String name) {
        return "update_companion_signature".equals(name) || "set_companion_mood".equals(name) || "create_memory_draft".equals(name) || "add_work_item".equals(name) || "write_room_entry".equals(name) || "set_appearance".equals(name) || "create_toy".equals(name) || "update_toy".equals(name) || "create_calendar_event".equals(name);
    }

    private boolean containsTool(JSArray enabled, String expected) {
        for (int index = 0; index < enabled.length(); index++) if (expected.equals(enabled.optString(index, ""))) return true;
        return false;
    }

    private JSONArray clientTools(JSArray enabled) throws Exception {
        JSONArray result = new JSONArray();
        for (int index = 0; index < enabled.length(); index++) {
            String name = enabled.optString(index, ""); if (!isClientTool(name)) continue;
            JSONObject properties = new JSONObject(); JSONArray required = new JSONArray(); String description;
            if ("update_companion_signature".equals(name)) { description = "Only when explicitly requested, update the companion's own visible signature on this device."; properties.put("signature", new JSONObject().put("type", "string").put("maxLength", 160)); required.put("signature"); }
            else if ("set_companion_mood".equals(name)) { description = "Publish the companion's own current visible mood to the phone. Use sparingly when the companion deliberately wants it seen; the user does not need to maintain it."; properties.put("title", new JSONObject().put("type", "string").put("maxLength", 80)); properties.put("detail", new JSONObject().put("type", "string").put("maxLength", 500)); required.put("title"); required.put("detail"); }
            else if ("create_memory_draft".equals(name)) { description = "Create a reviewable local memory draft; it is not automatically injected."; properties.put("title", new JSONObject().put("type", "string").put("maxLength", 120)); properties.put("content", new JSONObject().put("type", "string").put("maxLength", 4000)); required.put("title"); required.put("content"); }
            else if ("add_work_item".equals(name)) { description = "Add a concrete task to the shared local work notebook."; properties.put("title", new JSONObject().put("type", "string").put("maxLength", 160)); properties.put("content", new JSONObject().put("type", "string").put("maxLength", 4000)); required.put("title"); }
            else if ("write_room_entry".equals(name)) { description = "Write a real entry to a shared local room when explicitly requested, or leave the companion's own occasional whisper. Never impersonate the user."; properties.put("room", new JSONObject().put("type", "string").put("enum", new JSONArray().put("timeline").put("letter").put("checkin").put("work").put("diary").put("repair").put("whisper"))); properties.put("title", new JSONObject().put("type", "string").put("maxLength", 160)); properties.put("content", new JSONObject().put("type", "string").put("maxLength", 4000)); properties.put("subtype", new JSONObject().put("type", "string").put("maxLength", 80)); required.put("room"); required.put("content"); }
            else if ("set_appearance".equals(name)) { description = "Change the local shell appearance only when explicitly requested."; properties.put("theme", new JSONObject().put("type", "string").put("enum", new JSONArray().put("redleaf").put("blue").put("sakura").put("wisteria").put("tide").put("amber"))); properties.put("mode", new JSONObject().put("type", "string").put("enum", new JSONArray().put("light").put("dark"))); properties.put("effect", new JSONObject().put("type", "string").put("enum", new JSONArray().put("none").put("snow").put("rain").put("heart").put("leaf").put("butterfly").put("star").put("bubble").put("glow").put("paw"))); }
            else if ("create_toy".equals(name)) { description = "Create a complete self-contained offline HTML toy only when explicitly requested. No external assets, network, storage, forms or embedded pages; include touch and keyboard controls."; properties.put("title", new JSONObject().put("type", "string").put("maxLength", 120)); properties.put("html", new JSONObject().put("type", "string").put("maxLength", 120000)); required.put("title"); required.put("html"); }
            else if ("update_toy".equals(name)) { description = "Replace one explicitly named non-system local toy with a complete safe offline HTML document while preserving its identity and activity history."; properties.put("targetTitle", new JSONObject().put("type", "string").put("maxLength", 120)); properties.put("title", new JSONObject().put("type", "string").put("maxLength", 120)); properties.put("html", new JSONObject().put("type", "string").put("maxLength", 120000)); required.put("targetTitle"); required.put("title"); required.put("html"); }
            else { description = "Create one event in the user's selected writable device calendar only when the current request explicitly asks to add it. Use ISO-8601 timestamps with timezone offsets; never delete or silently reschedule existing events."; properties.put("title", new JSONObject().put("type", "string").put("maxLength", 200)); properties.put("startAt", new JSONObject().put("type", "string").put("maxLength", 64)); properties.put("endAt", new JSONObject().put("type", "string").put("maxLength", 64)); properties.put("location", new JSONObject().put("type", "string").put("maxLength", 500)); properties.put("notes", new JSONObject().put("type", "string").put("maxLength", 2000)); properties.put("allDay", new JSONObject().put("type", "boolean")); required.put("title"); required.put("startAt"); required.put("endAt"); }
            JSONObject schema = new JSONObject().put("type", "object").put("properties", properties).put("additionalProperties", false); if (required.length() > 0) schema.put("required", required);
            result.put(new JSONObject().put("type", "function").put("function", new JSONObject().put("name", name).put("description", description).put("parameters", schema)));
        }
        return result;
    }

    private String systemPrompt(JSArray people, JSArray memories, JSArray roomContext, JSArray calendarContext, String speechDelivery) {
        StringBuilder value = new StringBuilder("你是这台赴约小手机中的陪伴者。严格依据下方由使用者审阅的资料回应；不得声称继承了未提供的记忆或隐藏思维。最新一条用户消息才是本轮命令；不得重复上一轮工具操作，每个工具调用都必须直接对应本轮要求。人物、记忆、共同房间、玩具盒、日历和外观变更需要用户明确要求；没有工具调用就不得声称已改动手机资料，也不得冒充用户写入。只有用户当轮明确要求新增日程时才可以调用 create_calendar_event；已有日历上下文只读，不得静默改动或删除。你可以偶尔用 set_companion_mood 主动公开自己此刻真实、可见的短态，或用 write_room_entry 留下自己的碎碎念；不要每轮都改，也不要伪造隐藏测量。\n");
        if ("eleven_v3_audio_tags".equals(speechDelivery)) value.append("\n这条回复将由 Eleven v3 念出。用自然口语英文回答，并按每个当下情绪自行选择行内表演标签。只用半角方括号，例如 [softly] [sighs] [whispers] [laughs] [excited] [curious] [crying] [sad] [slow] [pause]。标签是表演指令，不是要解释的台词；只在自然时使用，不要给整通电话强套一种固定语气，不用全角括号。\n");
        appendPeople(value, people); appendMemories(value, memories); appendRoomContext(value, roomContext); appendCalendarContext(value, calendarContext);
        return value.length() > 30_000 ? value.substring(0, 30_000) : value.toString();
    }

    private void appendPeople(StringBuilder value, JSArray people) {
        for (int index = 0; index < people.length(); index++) {
            JSONObject person = people.optJSONObject(index); if (person == null) continue;
            value.append("\n[人物 ").append(person.optString("displayName", "")).append("]\n").append(person.optString("bio", "")).append("\n").append(person.optString("voiceNotes", ""));
        }
    }

    private void appendMemories(StringBuilder value, JSArray memories) {
        if (memories.length() > 0) value.append("\n[已审阅记忆]\n");
        for (int index = 0; index < memories.length(); index++) {
            JSONObject memory = memories.optJSONObject(index); if (memory == null) continue;
            value.append("- ").append(memory.optString("title", "")).append(": ").append(memory.optString("content", "")).append("\n");
        }
    }

    private void appendRoomContext(StringBuilder value, JSArray roomContext) {
        if (roomContext.length() > 0) value.append("\n[当前本地房间与工作本]\n");
        int start = Math.max(0, roomContext.length() - 80);
        for (int index = start; index < roomContext.length(); index++) {
            JSONObject entry = roomContext.optJSONObject(index); if (entry == null) continue;
            value.append("- [").append(entry.optString("room", "记录")).append("] ")
                .append(entry.optString("title", "")).append(": ").append(entry.optString("content", "")).append("\n");
        }
    }

    private void appendCalendarContext(StringBuilder value, JSArray calendarContext) {
        if (calendarContext.length() > 0) value.append("\n[用户选中的手机日历]\n");
        int start = Math.max(0, calendarContext.length() - 100);
        for (int index = start; index < calendarContext.length(); index++) {
            JSONObject entry = calendarContext.optJSONObject(index); if (entry == null) continue;
            value.append("- ").append(entry.optString("startAt", ""));
            if (entry.optBoolean("allDay", false)) value.append(" 全天");
            value.append(" ").append(entry.optString("title", ""));
            String location = entry.optString("location", ""); if (!location.isEmpty()) value.append(" @ ").append(location);
            value.append("\n");
        }
    }

    private void appendHistory(JSONArray messages, JSArray history) throws Exception {
        int start = Math.max(0, history.length() - 100);
        for (int index = start; index < history.length(); index++) {
            JSONObject item = history.optJSONObject(index); if (item == null) continue;
            String role = "companion".equals(item.optString("role")) ? "assistant" : "user";
            String content = item.optString("content", "").trim();
            if (!content.isEmpty() && content.length() <= 20_000) messages.put(new JSONObject().put("role", role).put("content", content));
        }
    }

    private HttpsURLConnection connection(String url, String method, String apiKey) throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(url).openConnection();
        connection.setRequestMethod(method); connection.setConnectTimeout(15_000); connection.setReadTimeout(90_000);
        connection.setRequestProperty("Accept", "application/json"); connection.setRequestProperty("Authorization", "Bearer " + apiKey);
        if ("POST".equals(method)) connection.setDoOutput(true);
        return connection;
    }

    private String httpError(HttpsURLConnection connection, int status) {
        if (status == 400 || status == 422) return "供应商不接受这次请求，请检查模型或稍后重试";
        if (status == 401 || status == 403) return "API Key 没有通过供应商验证，请回到模型连接重新保存";
        if (status == 404) return "模型或接口地址不存在，请回到模型连接重新选择";
        if (status == 408 || status == 504) return "供应商响应超时，你的原话仍保存在本机";
        if (status == 429) return "供应商当前限流或额度不足，请稍后重试";
        return "供应商暂时没有完成这次回复（" + status + "）";
    }

    private String read(InputStream stream) throws Exception {
        if (stream == null) return ""; StringBuilder value = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) { String line; while ((line = reader.readLine()) != null && value.length() < 1_000_000) value.append(line); }
        return value.toString();
    }

    private SecretKey secretKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    private String encrypt(String plain) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, secretKey());
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." + Base64.encodeToString(cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
    }

    private String decrypt(String saved) throws Exception {
        String[] parts = saved.split("\\.", 2); if (parts.length != 2) throw new Exception("安全存储无法读取，请重新配置 Key");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    private String normalizedHttps(String value) {
        try { URL url = new URL(trimmed(value)); if (!"https".equalsIgnoreCase(url.getProtocol()) || url.getHost().isEmpty()) return null; String path = url.getPath().replaceAll("/+$", ""); return "https://" + url.getAuthority() + path; }
        catch (Exception ignored) { return null; }
    }
    private String trimmed(String value) { return value == null ? "" : value.trim(); }
    private String safeMessage(Exception error, String fallback) { String message = trimmed(error.getMessage()); return message.isEmpty() ? fallback : message; }
    private String safeProviderMessage(Exception error) {
        String message = trimmed(error.getMessage());
        if (message.startsWith("供应商") || message.startsWith("API Key") || message.startsWith("模型")) return message;
        return "网络或供应商刚才没有接住，你的原话仍保存在本机";
    }
}
