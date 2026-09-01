# @fuyue/core

赴约的数据与能力契约，不含界面、模型 Key 或任何人的数据。可以只引入需要的子路径：

- `@fuyue/core/types`：人物、原文、记忆、房间与外观类型。
- `@fuyue/core/repository`：LocalData 仓库约定与内存实现。
- `@fuyue/core/indexeddb`：浏览器 IndexedDB 实现。
- `@fuyue/core/snapshot`：可迁移副本的导入、验证与导出。
- `@fuyue/core/gateway`：自建 relay 与设备桥的客户端契约。
- `@fuyue/core/voice`：语音供应商、实时事件与全双工契约。
- `@fuyue/core/capabilities`：功能包注册表与装配计划。

真实边界：清除站点数据会清除未导出的 IndexedDB 副本；这个包不会自动运行模型、记忆蒸馏或云同步。
