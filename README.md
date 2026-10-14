# RadFit Tools

**简体中文** | [English](README.en.md)

电离辐射计量用 X 射线能谱计算器，powered by 唐逊。

当前版本：**v1.0.0-beta.1**。网页无需后台，每页独立内嵌计算数据，唯一外部依赖为 ECharts，含两个 CDN 兜底。

## 使用

- [ISO 4037 防护辐射质](index.html)：N/W/H/L 共 50 个预设。
- [诊断 X 射线](diagnostic.html)：IEC 61267:2005 / IAEA TRS-457，RQR、RQA、RQT、RQR-M、RQA-M 共 29 个预设。

下载或克隆仓库后直接打开 `index.html`，页首按钮切换两页。两个 HTML 需放在同一目录。联网可加载图表；图表组件加载失败时，数值、预设和 CSV 仍可使用。

诊断页面的乳腺系列使用独立 Mo 钼靶实测基础谱。RQR-M 采用 0.032 mm Mo，RQA-M 在对应基础上增加 2 mm Al。原 ISO 参数不重新拟合。

## 版本规则

两个页面共用一个软件版本号，遵循 `主版本.次版本.修订版本`：

| 变化 | 示例 |
| --- | --- |
| 修复输入、交互、文字或兼容问题，保持计算结果与导出约定 | `1.0.0` → `1.0.1` |
| 增加预设或功能，保持已有输入、结果和 CSV 兼容 | `1.0.1` → `1.1.0` |
| 改变既有计算约定、主要物理模型或不兼容的 CSV 格式 | `1.1.0` → `2.0.0` |
| 预发布迭代 | `1.0.0-beta.1` → `1.0.0-beta.2` |

软件版本保存在 `VERSION` 和 `version.json`，页面显示相同版本。Git 标签使用 `v` 前缀，例如 `v1.0.0-beta.1`。日期另行记录，不替代版本号。已发布标签不覆盖，修改后发布新版本。

标准版本分别固定为 ISO 4037-1:2019、IEC 61267:2005、IAEA TRS-457 (2007)。模型标识和参数 SHA256 独立记录，界面修改不意味着物理参数更改。具体见 `version.json` 与 `source_manifest.json`。

## 数值验证

安装 Node.js 后运行：

```sh
node tests/verify.cjs
```

测试自带固定基线与 Python 参考结果，不依赖作者电脑上的其他目录。检查原 50 个 ISO 预设、29 个诊断预设、21 个 W 谱计算与 17 个 Mo 节点/中间电压结果，以及 CSV、输入边界、零谱和 TRS 来源切换。结果写入 `reports/test_report.json`。

当前 JS/Python 最大偏差：ISO `7.42e-8%`，诊断 W `1.49e-10%`，Mo `2.51e-8%`，均小于 2%。这是算法实现一致性，不是实际装置的测量准确度。

如需运行 Python 参考：W 分支需要 `numpy`，Mo 分支只使用标准库。`python diagnostic_model.py` 默认只输出现有参数下的参考结果，不覆盖参数；`python mo_model.py --kvp 28 --mo-mm 0.032 --al-mm 2` 计算乳腺条件。

## GitHub Pages

本项目可作为静态网站部署。在仓库 **Settings → Pages → Deploy from a branch** 中选择 `main` 和 `/(root)`，保存后由 GitHub 提供在线访问地址。也可通过 Git 标签/Release 下载离线版本。

## 文件与来源

`index.html`、`diagnostic.html` 是完整网页；JSON 保存标准表值、模型参数与来源；Python 文件提供参考实现；`tests/` 保存独立回归测试；`verification_report.json` 记录验证范围。

详见 [使用说明](使用说明.txt)、[快速验证](快速验证.txt)、[标准与模型说明](标准与模型说明.txt)和[第三方来源与许可](THIRD_PARTY_NOTICES.md)。此仓库不分发 IEC 或 TRS 原始 PDF。

结果属于给定模型和源条件下的估计。标准表值残差、JS/Python 一致性和真实装置符合性分别评价。RQR-M 的 HVL 单项使用绝对 ±0.02 mm Al；名义 HVL 残差不能用统一 2% 阈值替代标准的建立过程。

本仓库代码的使用许可由作者另行明确；第三方数据仍依各自许可使用。
