package love.fuyue.phone;

import com.getcapacitor.PermissionState;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class FuyueVoicePluginTest {
    @Test
    public void permissionLabelsDoNotMisreportARejectedMicrophoneAsUnasked() {
        assertEquals("granted", FuyueVoicePlugin.publicPermissionState(PermissionState.GRANTED));
        assertEquals("denied", FuyueVoicePlugin.publicPermissionState(PermissionState.DENIED));
        assertEquals("denied", FuyueVoicePlugin.publicPermissionState(PermissionState.PROMPT_WITH_RATIONALE));
        assertEquals("prompt", FuyueVoicePlugin.publicPermissionState(PermissionState.PROMPT));
    }

    @Test
    public void providerErrorsDoNotExposeRawResponseBodies() {
        assertEquals("语音供应商拒绝了配置（400）；请确认填写的是可调用的 API Key，并检查 Voice ID 与模型", FuyueVoicePlugin.publicHttpError(400, "not json"));
        assertEquals("语音供应商拒绝了 API Key（401）；请重新创建或检查权限", FuyueVoicePlugin.publicHttpError(401, ""));
        assertEquals("语音供应商限流或额度不足（429）；稍后重试或检查额度", FuyueVoicePlugin.publicHttpError(429, ""));
        assertEquals("语音供应商暂时不可用（503）；可以稍后重试", FuyueVoicePlugin.publicHttpError(503, ""));
        assertEquals("这里填成了 API Key ID；请粘贴创建时只显示一次、以 sk_ 开头的完整 Key", FuyueVoicePlugin.publicHttpError(400, "{\"detail\":{\"status\":\"api_key_id_used_as_api_key\"}}"));
        assertEquals("ElevenLabs 没有认出这把 Key；请检查是否复制完整、已过期、被停用或已轮换", FuyueVoicePlugin.publicHttpError(401, "{\"detail\":{\"status\":\"invalid_api_key\",\"message\":\"do not expose this\"}}"));
        assertEquals("这把 Key 缺少当前操作权限；电话需要 Voices read、Text to Speech 与 Speech to Text", FuyueVoicePlugin.publicHttpError(403, "{\"detail\":{\"code\":\"missing_permissions\"}}"));
    }
}
