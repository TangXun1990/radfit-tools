# 第三方来源与许可

项目代码与第三方数据的许可分别处理。代码许可由项目作者明确，本说明不替作者授予新的代码许可证。

## PTB 钼靶谱数据

Ketelhut, S., & Büermann, L. (2020). *Catalogue of unfiltered x-ray spectra from tungsten-, molybdenum-, and rhodium-anode-based x-ray tubes with generating voltages from 10 kV to 50 kV in steps of 1 kV*. Physikalisch-Technische Bundesanstalt.

- DOI：[10.7795/720.20201118](https://doi.org/10.7795/720.20201118)
- 归档：[PTB-OAR](https://oar.ptb.de/resources/show/10.7795/720.20201118)
- 许可：[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- 原始 ZIP SHA256：`2d61ec2784128b4a8de0870a43c2428f43e8f7834754270ffcf1db3520ee30bf`

本项目选用 25–35 kV 的 11 档 Mo 谱，去除端点以上测量尾部、转换为箱中心和箱光子权重、重新归一化，非整数电压在相邻谱之间插值，再按 Beer–Lambert 定律施加过滤。此处理属于对原数据的改编，不表示 PTB 对本工具的结果作出认可。

基础谱的 26° Mo 靶角、固有 1 mm Be 和 1 m 空气路径均保留在模型说明中，不重复施加。完整处理记录见 `Mo来源说明.txt` 与 `mo_reference_spectra.json`。

## 衰减系数

Mo / Be 来源为 NIST 的质量衰减系数公开表：[Mo](https://physics.nist.gov/PhysRefData/XrayMassCoef/ElemTab/z42.html)、[Be](https://physics.nist.gov/PhysRefData/XrayMassCoef/ElemTab/z04.html)。Al、Air 等原表沿用作者提供的 ISO Python 参考模型，未改变原数值。

## 标准与操作规程

- ISO 4037-1:2019。
- IEC 61267:2005，第二版；根据作者提供的原文核验必要参考数据和页码。
- IAEA, *Dosimetry in Diagnostic Radiology: An International Code of Practice*, Technical Reports Series No. 457, Vienna (2007)。[IAEA 出版页面](https://www.iaea.org/publications/7638/dosimetry-in-diagnostic-radiology-an-international-code-of-practice)。

本仓库没有分发原始标准 PDF。IEC 原文缺页的补核方式和限制保留于数据来源记录。

## ECharts

网页加载 ECharts 5.5.1，使用固定版本 CDN，并保留可选本地文件路径。ECharts 未打包进入本仓库；其项目与许可说明见 [Apache ECharts](https://github.com/apache/echarts)。
