package love.fuyue.phone;

import static org.junit.Assert.assertEquals;

import com.getcapacitor.PermissionState;
import org.junit.Test;

public class FuyueDevicePluginTest {
    @Test
    public void reportsRationaleStateAsDenied() {
        assertEquals("denied", FuyueDevicePlugin.publicPermissionState(PermissionState.PROMPT_WITH_RATIONALE));
    }

    @Test
    public void preservesGrantedAndFirstPromptStates() {
        assertEquals("granted", FuyueDevicePlugin.publicPermissionState(PermissionState.GRANTED));
        assertEquals("not_determined", FuyueDevicePlugin.publicPermissionState(PermissionState.PROMPT));
    }
}
