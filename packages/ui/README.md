# @fuyue/ui

赴约前端积木，可按需引入：

- `@fuyue/ui/ambient`：雪、雨、爱心、树叶、蝴蝶、星屑、泡泡、萤火与猫爪。
- `@fuyue/ui/motion`：同一套时长、缓动和 reduced-motion 检测。
- `@fuyue/ui/stack-deck`：书房/房间使用的原地浮起透明叠卡。
- `@fuyue/ui/memory`：只依赖数据与回调的记忆账本前端。
- `@fuyue/ui/appearance`：主题、明暗、可多选漂浮物与三种壳排布的注册表和兼容归一化；`toggleLineEffectSelection` 负责叠加及“不飘”清空。
- `@fuyue/ui/splash`：可换 session key 与停留时间的开屏；拒绝 storage 时也能进入。
- `@fuyue/ui/styles.css`：叠卡和记忆的基础样式，可用 CSS 变量换肤。

这些入口只包含上述视觉层，不携带业务数据或连接配置。

## 许可

本包单独采用 [MIT](./LICENSE)：可以只取漂浮物、记忆可视化或叠卡，也可修改后用在自己的项目里，但需保留 MIT 通知。完整赴约应用仍按根目录的 AGPL-3.0-only 分发。
