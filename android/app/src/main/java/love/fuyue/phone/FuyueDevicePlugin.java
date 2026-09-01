package love.fuyue.phone;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import android.provider.CalendarContract.Calendars;
import android.provider.CalendarContract.Events;
import android.provider.CalendarContract.Instances;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.TimeZone;

@CapacitorPlugin(
    name = "FuyueDevice",
    permissions = {
        @Permission(alias = "calendarRead", strings = { Manifest.permission.READ_CALENDAR }),
        @Permission(alias = "calendarWrite", strings = { Manifest.permission.WRITE_CALENDAR })
    }
)
public class FuyueDevicePlugin extends Plugin {
    @PluginMethod
    public void saveJsonDocument(PluginCall call) {
        String content = call.getString("content", "");
        if (content.isEmpty()) { call.reject("没有可以保存的副本内容"); return; }
        if (content.getBytes(StandardCharsets.UTF_8).length > 40_000_000) { call.reject("副本超过 40 MB，请先移除大型图片或音频"); return; }
        String requested = trimmed(call.getString("fileName", "fuyue-localdata.json"));
        String fileName = requested.replaceAll("[\\\\/:*?\"<>|\\r\\n]", "_");
        if (fileName.isEmpty()) fileName = "fuyue-localdata.json";
        if (!fileName.toLowerCase().endsWith(".json")) fileName += ".json";
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("application/json")
            .putExtra(Intent.EXTRA_TITLE, fileName);
        try {
            startActivityForResult(call, intent, "saveJsonDocumentResult");
        } catch (ActivityNotFoundException error) {
            call.reject("这台手机没有可用的文件保存器", error);
        }
    }

    @ActivityCallback
    private void saveJsonDocumentResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri target = data == null ? null : data.getData();
        if (result.getResultCode() != Activity.RESULT_OK || target == null) {
            call.resolve(new JSObject().put("saved", false));
            return;
        }
        String content = call.getString("content", "");
        try (OutputStream output = getContext().getContentResolver().openOutputStream(target, "w")) {
            if (output == null) { call.reject("系统没有打开所选文件"); return; }
            output.write(content.getBytes(StandardCharsets.UTF_8));
            output.flush();
            call.resolve(new JSObject().put("saved", true).put("fileName", trimmed(call.getString("fileName", "fuyue-localdata.json"))));
        } catch (Exception error) {
            call.reject("副本没有写入所选位置", error);
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("calendarRead", publicPermission("calendarRead"));
        result.put("calendarWrite", publicPermission("calendarWrite"));
        result.put("health", "unavailable");
        call.resolve(result);
    }

    @PluginMethod
    public void requestCalendarAccess(PluginCall call) {
        String mode = call.getString("mode", "read");
        if ("read_write".equals(mode)) {
            if (granted("calendarRead") && granted("calendarWrite")) { getStatus(call); return; }
            requestPermissionForAliases(new String[] { "calendarRead", "calendarWrite" }, call, "calendarPermissionCallback");
            return;
        }
        if (granted("calendarRead")) { getStatus(call); return; }
        requestPermissionForAlias("calendarRead", call, "calendarPermissionCallback");
    }

    @PermissionCallback
    public void calendarPermissionCallback(PluginCall call) { getStatus(call); }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.fromParts("package", getContext().getPackageName(), null));
        try {
            getActivity().startActivity(intent);
            call.resolve(new JSObject().put("opened", true));
        } catch (ActivityNotFoundException error) {
            call.reject("这台手机没有打开应用权限设置", error);
        }
    }

    @PluginMethod
    public void listCalendars(PluginCall call) {
        if (!granted("calendarRead")) { call.reject("请先允许赴约读取日历"); return; }
        JSArray result = new JSArray();
        String[] projection = { Calendars._ID, Calendars.CALENDAR_DISPLAY_NAME, Calendars.ACCOUNT_NAME, Calendars.CALENDAR_ACCESS_LEVEL, Calendars.VISIBLE };
        try (Cursor cursor = getContext().getContentResolver().query(Calendars.CONTENT_URI, projection, Calendars.VISIBLE + "=1", null, Calendars.CALENDAR_DISPLAY_NAME + " COLLATE LOCALIZED ASC")) {
            if (cursor != null) while (cursor.moveToNext()) {
                JSObject item = new JSObject();
                item.put("id", String.valueOf(cursor.getLong(0)));
                item.put("name", safe(cursor.getString(1), "未命名日历"));
                item.put("account", safe(cursor.getString(2), ""));
                item.put("writable", cursor.getInt(3) >= Calendars.CAL_ACCESS_CONTRIBUTOR);
                result.put(item);
            }
            call.resolve(new JSObject().put("calendars", result));
        } catch (Exception error) { call.reject("没有读到系统日历", error); }
    }

    @PluginMethod
    public void readCalendar(PluginCall call) {
        if (!granted("calendarRead")) { call.reject("请先允许赴约读取日历"); return; }
        long now = System.currentTimeMillis();
        long from = call.getLong("from", now - 86_400_000L);
        long to = call.getLong("to", now + 14L * 86_400_000L);
        if (to <= from || to - from > 93L * 86_400_000L) { call.reject("日历读取范围必须在 93 天以内"); return; }
        Uri.Builder builder = Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(builder, from);
        ContentUris.appendId(builder, to);
        String[] projection = { Instances.EVENT_ID, Instances.CALENDAR_ID, Instances.TITLE, Instances.BEGIN, Instances.END, Instances.EVENT_LOCATION, Instances.ALL_DAY };
        JSArray result = new JSArray();
        try (Cursor cursor = getContext().getContentResolver().query(builder.build(), projection, null, null, Instances.BEGIN + " ASC")) {
            if (cursor != null) while (cursor.moveToNext()) {
                JSObject item = new JSObject();
                item.put("id", String.valueOf(cursor.getLong(0)));
                item.put("calendarId", String.valueOf(cursor.getLong(1)));
                item.put("title", safe(cursor.getString(2), "未命名安排"));
                item.put("startAtMs", cursor.getLong(3));
                item.put("endAtMs", cursor.getLong(4));
                item.put("location", safe(cursor.getString(5), ""));
                item.put("allDay", cursor.getInt(6) == 1);
                result.put(item);
            }
            call.resolve(new JSObject().put("events", result));
        } catch (Exception error) { call.reject("没有读到系统日程", error); }
    }

    @PluginMethod
    public void openCreateEvent(PluginCall call) {
        String title = trimmed(call.getString("title", ""));
        long startAt = call.getLong("startAt", System.currentTimeMillis() + 3_600_000L);
        long endAt = call.getLong("endAt", startAt + 3_600_000L);
        Intent intent = new Intent(Intent.ACTION_INSERT).setData(Events.CONTENT_URI)
            .putExtra(Events.TITLE, title)
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startAt)
            .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endAt)
            .putExtra(Events.EVENT_LOCATION, trimmed(call.getString("location", "")))
            .putExtra(Events.DESCRIPTION, trimmed(call.getString("notes", "")));
        try {
            getActivity().startActivity(intent);
            call.resolve(new JSObject().put("opened", true));
        } catch (ActivityNotFoundException error) {
            call.reject("这台手机没有可用的日历应用", error);
        }
    }

    @PluginMethod
    public void createCalendarEvent(PluginCall call) {
        if (!granted("calendarWrite")) { call.reject("请先允许赴约写入日历"); return; }
        String calendarId = trimmed(call.getString("calendarId", ""));
        String title = trimmed(call.getString("title", ""));
        long startAt = call.getLong("startAt", 0L);
        long endAt = call.getLong("endAt", 0L);
        boolean allDay = Boolean.TRUE.equals(call.getBoolean("allDay", false));
        if (calendarId.isEmpty() || title.isEmpty() || startAt <= 0 || endAt <= startAt) { call.reject("日历、标题或时间不完整"); return; }
        try {
            ContentValues values = new ContentValues();
            values.put(Events.CALENDAR_ID, Long.parseLong(calendarId));
            values.put(Events.TITLE, title);
            values.put(Events.DTSTART, startAt);
            values.put(Events.DTEND, endAt);
            values.put(Events.EVENT_TIMEZONE, TimeZone.getDefault().getID());
            values.put(Events.ALL_DAY, allDay ? 1 : 0);
            values.put(Events.EVENT_LOCATION, trimmed(call.getString("location", "")));
            values.put(Events.DESCRIPTION, trimmed(call.getString("notes", "")));
            Uri created = getContext().getContentResolver().insert(Events.CONTENT_URI, values);
            if (created == null) { call.reject("系统日历没有接受这条安排"); return; }
            call.resolve(new JSObject().put("id", created.getLastPathSegment()));
        } catch (NumberFormatException error) { call.reject("这个日历标识已经失效，请重新选择日历", error); }
        catch (Exception error) { call.reject("安排没有写入系统日历", error); }
    }

    @PluginMethod
    public void deleteCalendarEvent(PluginCall call) {
        if (!granted("calendarWrite")) { call.reject("请先允许赴约写入日历"); return; }
        String eventId = trimmed(call.getString("eventId", ""));
        if (!eventId.matches("\\d+")) { call.reject("测试日程标识无效"); return; }
        try {
            Uri target = ContentUris.withAppendedId(Events.CONTENT_URI, Long.parseLong(eventId));
            int deleted = getContext().getContentResolver().delete(target, null, null);
            call.resolve(new JSObject().put("deleted", deleted == 1));
        } catch (Exception error) { call.reject("测试日程没有删除", error); }
    }

    private boolean granted(String alias) { return getPermissionState(alias) == PermissionState.GRANTED; }
    private String publicPermission(String alias) {
        return publicPermissionState(getPermissionState(alias));
    }
    static String publicPermissionState(PermissionState state) {
        if (state == PermissionState.GRANTED) return "granted";
        if (state == PermissionState.DENIED) return "blocked";
        if (state == PermissionState.PROMPT_WITH_RATIONALE) return "denied";
        return "not_determined";
    }
    private String safe(String value, String fallback) { return value == null || value.trim().isEmpty() ? fallback : value.trim(); }
    private String trimmed(String value) { return value == null ? "" : value.trim(); }
}
