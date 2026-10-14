# RadFit Tools

[简体中文](README.md) | **English**

An X-ray spectrum calculator for ionizing radiation metrology, powered by 唐逊.

Current version: **v1.0.0-beta.2**. No backend is required. Each page embeds its own calculation data. ECharts is the only external dependency, with two CDN fallbacks.

## Usage

- [ISO 4037 radiation protection qualities](index.html): 50 presets across the N/W/H/L series.
- [Diagnostic X-rays](diagnostic.html): IEC 61267:2005 / IAEA TRS-457, with 29 presets across RQR, RQA, RQT, RQR-M and RQA-M.

Download or clone the repository and open `index.html` directly. Use the buttons at the top of the page to switch between the two pages. Both HTML files must be in the same directory. An internet connection allows the charts to load; numerical results, presets and CSV export remain available if the chart component fails to load.

The mammography series on the diagnostic page uses an independent measured Mo (molybdenum) anode basis spectrum. RQR-M uses 0.032 mm Mo filtration; RQA-M adds 2 mm Al to the corresponding basis. The original ISO parameters are not refitted.

## Versioning

Both pages share one software version, following `major.minor.patch`:

| Change | Example |
| --- | --- |
| Fix input handling, interactions, wording or compatibility issues while preserving calculation results and export conventions | `1.0.0` → `1.0.1` |
| Add presets or features while maintaining compatibility with existing inputs, results and CSV exports | `1.0.1` → `1.1.0` |
| Change existing calculation conventions, a major physical model or the CSV format in an incompatible way | `1.1.0` → `2.0.0` |
| Prerelease iteration | `1.0.0-beta.1` → `1.0.0-beta.2` |

The software version is stored in `VERSION` and `version.json`, and both pages display the same version. Git tags use the `v` prefix, for example `v1.0.0-beta.1`. Dates are recorded separately and do not replace version numbers. Published tags are not overwritten; changes are released under a new version.

The standard editions are fixed separately as ISO 4037-1:2019, IEC 61267:2005 and IAEA TRS-457 (2007). Model identifiers and parameter SHA256 hashes are recorded independently. Interface changes do not imply changes to physical parameters. See `version.json` and `source_manifest.json` for details.

## Numerical verification

After installing Node.js, run:

```sh
node tests/verify.cjs
```

The tests include fixed baselines and Python reference results, without depending on other directories on the author's computer. They check the original 50 ISO presets, 29 diagnostic presets, 21 W spectrum calculations and 17 Mo results at tabulated and intermediate tube voltages, as well as CSV export, input boundaries, zero spectra and switching to the TRS source. Results are written to `reports/test_report.json`.

Current maximum JS/Python deviations: ISO `7.42e-8%`, diagnostic W `1.49e-10%` and Mo `2.51e-8%`, all below 2%. These values measure consistency between algorithm implementations, not the measurement accuracy of an actual installation.

To run the Python references, the W branch requires `numpy`; the Mo branch uses only the standard library. By default, `python diagnostic_model.py` only outputs reference results using the existing parameters and does not overwrite them. `python mo_model.py --kvp 28 --mo-mm 0.032 --al-mm 2` calculates the mammography conditions.

## GitHub Pages

This project can be deployed as a static website. In the repository's **Settings → Pages → Deploy from a branch**, select `main` and `/(root)` and save. GitHub will then provide an online URL. Offline versions can also be downloaded through Git tags or Releases.

## Files and sources

`index.html` and `diagnostic.html` are complete web pages. JSON files store standard table values, model parameters and sources. Python files provide reference implementations. `tests/` contains independent regression tests, and `verification_report.json` records the scope of verification.

For details, see the [usage instructions](使用说明.txt), [quick verification guide](快速验证.txt), [standards and model notes](标准与模型说明.txt) and [third-party sources and licenses](THIRD_PARTY_NOTICES.md). These supporting documents are currently in Chinese. This repository does not distribute the original IEC or TRS PDFs.

Results are estimates for the specified model and source conditions. Residuals against standard table values, JS/Python consistency and conformity of an actual installation are evaluated separately. The individual RQR-M HVL criterion uses an absolute tolerance of ±0.02 mm Al. A uniform 2% threshold for nominal HVL residuals cannot replace the standard's procedure for establishing radiation qualities.

The author will specify the usage license for this repository's code separately. Third-party data remain subject to their respective licenses.
