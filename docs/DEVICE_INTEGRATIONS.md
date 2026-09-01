# 手机授权与自动填入

系统权限必须按运行载体分层。界面只能在使用者主动点到对应功能时请求所需的最小权限；拒绝后继续提供可恢复路径，不能在首页批量索权，也不能用演示数据冒充已经同步。

## 能力矩阵

| 能力 | PWA | 托管 / 自建 relay | Android APK | iOS 原生壳 |
| --- | --- | --- | --- | --- |
| 头像与相册 | 用户点“选择照片”后打开系统文件 / 照片选择器；只取得被选中的文件 | 可选上传到使用者自己的媒体存储 | 当前沿用 WebView 文件选择；未要求整库权限 | 使用系统 PhotosPicker；优先只选照片，不申请整库读取 |
| 日历与课表 | 不能直接读取手机系统日历；`.ics` 导入仍是待实现能力，或读取自己的日历服务 | 通过用户明确连接的日历 OAuth、CalDAV 或捷径写入 `/v1/life/overview` 的真源 | 源码已加入按需 Calendar Provider 读写桥、目标日历选择和系统确认页；下一版 APK 仍需真机权限与厂商日历验收 | EventKit 仍只有契约，没有公开原生壳 |
| 健康 | 普通网页没有 HealthKit；只能导入用户主动导出的摘要 | iPhone 捷径按用户选择的指标定时上报，或接入发行者自己的受控同步服务 | 当前未集成 Health Connect，不展示虚假授权状态 | HealthKit 按具体数据类型请求读取权限；只保存产品实际展示的摘要 |
| 通知 | 浏览器支持时由用户点“打开通知”后请求 | relay / 推送服务只发送用户启用的事件 | 当前未要求通知权限 | 使用系统通知权限与设备令牌 |

## 推荐实现顺序

1. PWA 已完成照片选择与 relay 日程读取；`.ics` 导入未完成前必须保持诚实空态。
2. 给只用 iPhone 的用户提供可审阅的“赴约生活同步”捷径：用户选择日历、健康指标和自动化频率，捷径只把最小摘要发给自己的 relay。
3. 需要真正的系统日历与 HealthKit 授权时，再给同一前端套 iOS 原生壳。原生壳只实现设备桥，人物、聊天、记忆、页面和操作语法仍来自同一公开前端。

## 原生设备桥契约

Android 壳通过 Capacitor 的 `registerPlugin("FuyueDevice")` 提供窄接口；它不是可直接读取的 `window.FuyueDevice` 全局对象：

```ts
type DevicePermission = "not_determined" | "granted" | "denied" | "unavailable";
type NativeDeviceStatus = {
  platform: "android";
  calendarRead: DevicePermission;
  calendarWrite: DevicePermission;
  health: DevicePermission;
};

interface FuyueDeviceBridge {
  saveJsonDocument(input: { fileName: string; content: string }): Promise<{ saved: boolean; fileName?: string }>;
  getStatus(): Promise<NativeDeviceStatus>;
  requestCalendarAccess(input: { mode: "read" | "read_write" }): Promise<NativeDeviceStatus>;
  listCalendars(): Promise<{ calendars: Array<{ id: string; name: string; account: string; writable: boolean }> }>;
  readCalendar(input: { from: number; to: number }): Promise<{ events: unknown[] }>;
  openCreateEvent(event: { title: string; startAt: number; endAt: number; location?: string; notes?: string }): Promise<{ opened: boolean }>;
  createCalendarEvent(event: { calendarId: string; title: string; startAt: number; endAt: number; location?: string; notes?: string }): Promise<{ id: string }>;
  deleteCalendarEvent(input: { eventId: string }): Promise<{ deleted: boolean }>;
}
```

头像继续使用 WebView 的系统文件选择器，因此不属于这条原生插件契约。健康当前固定返回 `unavailable`，没有 `requestHealthAccess` 或 `readHealthSummary`；iOS 壳若以后实现 HealthKit，应另行版本化扩展，不能照本文虚构未实现方法。系统确认页不要求整库写权限；直接读取或写入 Calendar Provider 时才请求对应权限。源码接入不等于真机验收，候选 APK 仍要验证权限拒绝、撤回、多个账号日历、全天事件与返回栈。

桥接结果仍需经过与 relay 相同的运行时校验；权限状态不是数据本身，`granted` 也不能让前端扩大读取范围。

## 隐私边界

- 不在首次打开时连续弹日历、健康、照片和通知权限。
- 健康数据按指标逐项请求，不读取临床记录，不推断诊断。
- 拒绝权限不影响聊天、人物、记忆和 LocalData 导出。
- 系统权限可以随时撤回；界面每次读取前重新处理 `denied`、`limited` 和 `unavailable`。
- 发行包不预置服务器、捷径地址、账号、Cookie、密钥或真实生活数据。
