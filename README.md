# 分子视界 ChemVistas

交互式三维化学模型、量子电子云、118 元素温变周期表与三维化学反应过渡态模拟器。

## 核心功能

- **三维分子工作台**：内置经典无机、有机、医药分子与晶体晶胞，支持球棍、空间填充、共价线框、静电势（ESP）与分子偶极矩矢量展示；支持自由测距、键角、4 原子二面角测量与 VSEPR 三维分子实时搭建。
- **外部化学结构导入**：支持直接解析 `.xyz`、`.mol` / `.sdf`、`.pdb` 化学坐标文件及 PubChem CID 在线三维构象检索。
- **三维原子与量子轨道**：支持 118 号元素的三维玻尔电子壳层动画与 `1s`–`4f` 氢原子波函数正负相位概率电子云可视化。
- **三维化学反应模拟器**：支持经典反应与官能团通用规则推演，自动校验原子与质量守恒，配备反应物靠近 $\to$ 活化络合物过渡态 `[‡]`（旧键虚线断裂 / 新键虚线生成）$\to$ 产物分离的三维演化动画及同步势能曲线。
- **118 元素温变周期表**：支持分类筛选、`0–6000 K` 任意温度固/液/气物态模拟与周期律折线图联动。

## 本地开发与构建

环境要求：**Node.js >= 20**。

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器 (http://localhost:3000)
npm run dev

# 3. 运行静态类型检查 + 化学核心单元测试
npm run check

# 4. 执行完整发布构建脚本（类型检查 + 测试 + 产出 dist/）
npm run build:release

# 5. 生成用于 Release 上传的压缩归档包 (release/chemvistas-dist.tar.gz)
bash scripts/build-release.sh --archive

# 6. 本地预览生产构建结果
npm run preview
```

## 部署到 GitHub Pages

仓库已内置 `.github/workflows/ci-and-pages.yml` 自动构建与发布工作流：

1. 将代码推送到 GitHub 仓库的 `main` 分支。
2. 进入 GitHub 仓库 **Settings $\to$ Pages**，在 **Build and deployment $\to$ Source** 中选择 **GitHub Actions**。
3. 每次推送到 `main` 分支都会自动完成类型检查、11 项单元测试并将构建后的 `dist/` 发布至 GitHub Pages（已默认配置相对路径 `./` 与 `.nojekyll`，适配任意仓库子路径）。
