# 钢轨轧制轮廓在线检测系统

Rail Rolling Geometry Inspection System

面向重型钢铁轧制产线大型钢轨百米速度下全尺寸轮廓精度的在线工业级合规审计系统。

## 技术架构

### 后端 (NestJS + Node.js)
- **TCP 网关**: 无锁 Socket 监听，并发摄取多路激光测头 200Hz 高频二进制数据
- **二进制协议解析**: 位级剥离高精时间戳、测头编号、三维极坐标数组
- **Redis 缓存池**: 批量写入，高吞吐数据缓存层
- **WebSocket 网关**: 实时向前端推送拼接后的轮廓数据
- **数据整合**: 多路测头坐标变换与非线性圆周拼接

### 前端 (Vue3 + 原生 Canvas2D)
- **纯手写 Canvas 渲染管线**: 零依赖商业图表库，高性能实时渲染
- **坐标变换矩阵**: 物理空间到屏幕像素的仿射变换，支持缩放平移
- **点云热图渲染**: 基于激光强度的伪彩色可视化
- **UIC 60 标准参考**: 标准钢轨轮廓叠加对比
- **大屏仪表盘**: 多维度数据展示面板

## 项目结构

```
57-rail-rolling-geometry/
├── backend/                    # 后端服务
│   ├── src/
│   │   ├── main.ts            # 应用入口
│   │   ├── app.module.ts      # 根模块
│   │   ├── common/            # 通用类型与常量
│   │   ├── tcp-gateway/       # TCP 数据采集网关
│   │   │   ├── tcp-gateway.module.ts
│   │   │   ├── tcp-gateway.service.ts
│   │   │   └── sensor-simulator.ts   # 激光测头模拟器
│   │   ├── redis/             # Redis 缓存模块
│   │   ├── websocket/         # WebSocket 推送网关
│   │   └── profile/           # 轮廓数据整合模块
│   ├── package.json
│   ├── tsconfig.json
│   └── nest-cli.json
└── frontend/                   # 前端大屏
    ├── src/
    │   ├── main.ts
    │   ├── App.vue            # 主应用大屏布局
    │   ├── style.css
    │   ├── types.ts           # 类型定义
    │   ├── components/
    │   │   └── RailProfileCanvas.vue   # 核心 Canvas 组件
    │   ├── composables/
    │   │   └── useProfileSocket.ts     # WebSocket 封装
    │   └── utils/
    │       ├── matrix.ts      # 2D 变换矩阵
    │       └── uic60.ts       # UIC 60 轮廓生成
    ├── package.json
    ├── vite.config.ts
    └── index.html
```

## 二进制协议格式

```
+-----------------+-----------------+-----------------+-----------------+
|         Magic Number (4 bytes) = 0x5247454F ('RGEO')               |
+-----------------+-----------------+-----------------+-----------------+
|                         Total Length (4 bytes)                      |
+-----------------+-----------------+-----------------+-----------------+
|                      Timestamp High (4 bytes)                       |
+-----------------+-----------------+-----------------+-----------------+
|                      Timestamp Low  (4 bytes)                       |
+-----------------+-----------------+-----------------+-----------------+
|                        Frame ID (4 bytes)                           |
+-------+-------+-----------------+-----------------+-----------------+
| Point Count (2) |  Reserved (2)  |                                 |
+-----------------+-----------------+                                 |
|                                                                     |
|                    Point Data Array (variable)                      |
|                                                                     |
|  +-----------------+-----------------+-----------------+----------+  |
|  |       X (float32)      |       Y (float32)      |              |  |
|  +-----------------+-----------------+-----------------+ Z + Int. |  |
|  |       Z (float32)      | Intensity (uint16) | Res (uint16)|  |
|  +-----------------+-----------------+-----------------+----------+  |
|                                                                     |
+---------------------------------------------------------------------+
```

**每帧大小**: 16 字节头部 + 8 字节元数据 + N × 16 字节点数据

## 激光测头配置

| 测头ID | 名称 | 角度 | 距离 | TCP端口 |
|--------|------|------|------|---------|
| 1 | 顶部水平测头 | 0° | 150mm | 8081 |
| 2 | 左侧垂直测头 | 90° | 150mm | 8082 |
| 3 | 底部水平测头 | 180° | 150mm | 8083 |
| 4 | 右侧垂直测头 | 270° | 150mm | 8084 |

## UIC 60 钢轨参数

- 总高度: 172 mm
- 轨头宽度: 73 mm
- 轨头高度: 30 mm
- 轨腰厚度: 16.5 mm
- 轨腰高度: 90 mm
- 轨底宽度: 150 mm
- 轨底高度: 20 mm

## 快速开始

### 前置要求

- Node.js >= 18.x
- Redis >= 6.0
- npm 或 yarn

### 后端启动

```bash
cd backend
npm install

# 开发模式
npm run start:dev

# 生产模式
npm run build
npm run start:prod
```

服务端口:
- HTTP API: 3000
- WebSocket: 3000 (namespace: /profile)
- TCP 测头1: 8081
- TCP 测头2: 8082
- TCP 测头3: 8083
- TCP 测头4: 8084

### 启动模拟数据

```bash
cd backend
npx ts-node src/tcp-gateway/sensor-simulator.ts
```

模拟器会以 200Hz 频率从 4 个模拟测头发送 UIC 60 轮廓数据。

### 前端启动

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173 查看大屏。

### 构建生产版本

```bash
cd frontend
npm run build
```

## API 接口

### HTTP

- `GET /profile/latest` - 获取最新轮廓数据
- `GET /profile/status` - 获取系统状态

### WebSocket

Namespace: `/profile`

事件:
- `init` - 初始数据
- `fullFrame` - 完整帧数据 (20fps)
- `ping` / `pong` - 心跳检测

## 核心特性

- **200Hz 高频采集**: 每路测头每秒 200 帧原始数据
- **无锁架构**: 高并发 TCP 连接处理
- **批量 Redis 写入**: 50 帧一批，50ms 刷新周期
- **毫秒级渲染**: 纯 Canvas 渲染，坐标矩阵变换
- **非线性拼接**: 多路测头圆周角度拼接算法
- **实时热图**: 基于激光反射强度的伪彩色可视化
- **交互操作**: 鼠标拖拽平移、滚轮缩放

## 性能指标

- 单测头数据吞吐: ~6.4 MB/s (200Hz × 2048 点 × 16字节)
- 4 路合计吞吐: ~25.6 MB/s
- 前端渲染帧率: 60 FPS
- 端到端延迟: < 100ms

## License

MIT
