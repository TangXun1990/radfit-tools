# RadFit Tools

[简体中文](README.md) | **English**

An X-ray spectrum calculator for ionizing radiation metrology.

Current version: **v1.0.0-beta.8**. No backend is required. Each page embeds its own calculation data. ECharts is the only external dependency, with two CDN fallbacks.

## Usage

- [ISO 4037 radiation protection qualities](index.html): 50 presets across the N/W/H/L series.
- [Diagnostic X-rays](diagnostic.html): IEC 61267:2005 / IAEA TRS-457, with 29 presets across RQR, RQA, RQT, RQR-M and RQA-M.

Download or clone the repository and open `index.html` directly. Use the buttons at the top of the page to switch between the two pages. Both HTML files must be in the same directory. An internet connection allows the charts to load; numerical results, presets and CSV export remain available if the chart component fails to load.

Use **ENG / CHS** in the upper-right corner of either page to switch between English and Simplified Chinese, including input labels, results, charts, comparison tables and validation messages. Chinese is the initial default. The browser remembers the selected language, and page links carry the preference. Switching preserves parameters, presets and the reference source; calculation results and CSV fields remain unchanged.

The mammography series on the diagnostic page uses an independent measured Mo (molybdenum) anode basis spectrum. RQR-M uses 0.032 mm Mo filtration; RQA-M adds 2 mm Al to the corresponding basis. The original ISO parameters are not refitted.

Both pages allow an air path to be set. For ISO and diagnostic W, the input is an **additional** air path relative to the original fitted model, defaulting to 0 m. The fitted reference conditions may already include air effects, so the baseline is not necessarily a source-vacuum spectrum. The measured Mo basis already includes 1 m of air; an entered measurement distance `d` applies the path difference `d−1 m`, with a default of 1 m. For `d < 1 m`, this extrapolates back from the measured spectrum and cannot restore unmeasured soft photons.

The air calculation uses total mass attenuation coefficients and a fixed dry-air density of 1.205 kg/m³. It models narrow-beam primary attenuation only: there is no temperature or pressure correction, air scatter or geometric inverse-square factor, and the result is not an absolute dose at the measurement point. Main results change with distance; comparison-table predictions retain each model's original baseline. Default distances preserve earlier results. Air distance is not added to the existing CSV fields; when the distance differs from the baseline, it appears in the filename.

## H-series model limitations

H denotes the high air-kerma-rate series; its low-energy, lightly filtered conditions are particularly sensitive to the target, inherent filtration and air path. The original ISO model uses a fixed Be-to-Al equivalent coefficient and an approximate tungsten self-absorption table together with its fitted parameters. This tungsten table is not the complete [NIST tungsten mass attenuation table](https://physics.nist.gov/PhysRefData/XrayMassCoef/ElemTab/z74.html); substituting the latter while retaining the original parameters does not guarantee improved results.

At the comparison table's original model baseline (0 m additional air path), H-20 HVL₁ is approximately 0.1434 mm Al versus the ISO 1 m reference of 0.128 mm Al, a relative difference of about +12.0%. H-40 HVL₂ is approximately 1.0199 mm Al versus the ISO 1 m reference of 1.17 mm Al, a relative difference of about −12.8%. The model's fitted reference air path is unknown, so 0 m additional path cannot be equated directly with ISO's 1 m. These differences are not an error bound for arbitrary conditions. Higher-accuracy work requires a measured spectrum or an independently validated model.

The original fitting script also used `h` values from its reference rows as homogeneity targets, but some differ from `HVL₁/HVL₂` in the same row: for H-20 the target was 0.97 versus approximately 0.744 from 0.128/0.172; for H-30 it was 0.92 versus approximately 0.647 from 0.364/0.563. This inconsistency in the historical fitting targets may contribute to model differences, but its contribution cannot be quantified from this observation alone. The current page derives reference `h` from HVL₁/HVL₂ at the same distance; the original files and parameters remain unchanged, with no refit.

## IEC half-value-layer measurement geometry

According to Clause 5.7.1 of the [equivalent adoption of IEC 61267:2005](https://psqca.com.pk/cs/newitems2021/electronics/18-PS%20IEC%2061267-2009_FINAL.pdf), when establishing RQR qualities, the focal-spot-to-application-plane distance `D`, measured to the detector reference point, must be at least `max(550 mm, 2 × the focal-spot-to-HVL-test-device distance)`. Figure 1 depicts the test device 200–300 mm from the focal spot: at 300 mm, `D` must be at least 600 mm. Figure 2 also marks at least 550 mm from focal spot to reference point for RQA.

Clause 11.4 does not separately prescribe one fixed focal-spot-to-detector distance for RQR-M. The 200–300 mm in Clause 12.4 for RQA-M is the distance from the focal spot to the **entrance of the additional 2 mm Al filter**, not the detector. [IAEA TRS-457, Section 6.5.1](https://www-pub.iaea.org/MTCD/Publications/PDF/TRS457_web.pdf), additionally recommends that the aluminium HVL absorber-to-detector distance be at least five times the beam diameter at the detector, to reduce scatter.

The ISO/W air-path input is **additional** to the existing fitted-model baseline and cannot be treated directly as the total focal-spot-to-detector distance. The Mo 1 m baseline comes from the PTB measured basis spectrum; it is **not an IEC distance mandated for all mammography HVL measurements**.

## Versioning

Both pages share one software version, following `major.minor.patch`:

| Change | Example |
| --- | --- |
| Fix input handling, interactions, wording or compatibility issues while preserving calculation results and export conventions | `1.0.0` → `1.0.1` |
| Add presets or features while maintaining compatibility with existing inputs, results and CSV exports | `1.0.1` → `1.1.0` |
| Change existing calculation conventions, a major physical model or the CSV format in an incompatible way | `1.1.0` → `2.0.0` |
| Prerelease iteration | `1.0.0-beta.1` → `1.0.0-beta.2` |

The software version is stored in `VERSION` and `version.json`, and both pages display the same version. Git tags use the `v` prefix, for example `v1.0.0-beta.1`. Dates are recorded separately and do not replace version numbers. Ordinary updates do not overwrite published tags; changes are released under a new version.

The commit history and older tags have been updated. Reclone older checkouts and avoid pushing the old history back to the repository. The source manifest records hashes for the original webpage and the public test fixture separately; the fixture's calculation scripts remain unchanged.

The standard editions are fixed separately as ISO 4037-1:2019, IEC 61267:2005 and IAEA TRS-457 (2007). Model identifiers and parameter SHA256 hashes are recorded independently. Interface changes do not imply changes to physical parameters. See `version.json` and `source_manifest.json` for details.

## Numerical verification

After installing Node.js, run:

```sh
node tests/verify.cjs
node tests/language.cjs
node tests/air.cjs
```

The tests include fixed baselines and Python reference results, without depending on other directories on the author's computer. They check the original 50 ISO presets, 29 diagnostic presets, 21 W spectrum calculations and 17 Mo results at tabulated and intermediate tube voltages, as well as CSV export, input boundaries, zero spectra and switching to the TRS source. Results are written to `reports/test_report.json`.

Language tests check both interfaces, unchanged parameters and CSV content, saved preferences, page links and fallback behavior when browser storage is unavailable. Results are written to `reports/language_test_report.json`. Air-path tests independently calculate spectra and HVLs with Python and NumPy; if needed, set the `RADFIT_PYTHON` environment variable to a Python interpreter with NumPy installed. Results are written to `reports/air_test_report.json`. These tests execute the page scripts with simulated DOM / ECharts; they do not replace visual verification in a real browser.

Maximum JS/Python deviations at the default baseline: ISO `7.42e-8%`, diagnostic W `1.49e-10%` and Mo `2.51e-8%`, all below 2%. These values measure consistency between algorithm implementations, not the measurement accuracy of an actual installation.

To run the Python references, the W branch requires `numpy`; the Mo branch uses only the standard library. By default, `python diagnostic_model.py` only outputs reference results using the existing parameters and does not overwrite them. `python mo_model.py --kvp 28 --mo-mm 0.032 --al-mm 2` calculates the mammography conditions.

## GitHub Pages

This project can be deployed as a static website. In the repository's **Settings → Pages → Deploy from a branch**, select `main` and `/(root)` and save. GitHub will then provide an online URL. Offline versions can also be downloaded through Git tags or Releases.

## Files and sources

`index.html` and `diagnostic.html` are complete web pages. JSON files store standard table values, model parameters and sources. Python files provide reference implementations. `tests/` contains independent regression tests, and `verification_report.json` records the scope of verification.

For details, see the [usage instructions](使用说明.txt), [quick verification guide](快速验证.txt), [standards and model notes](标准与模型说明.txt) and [third-party sources and licenses](THIRD_PARTY_NOTICES.md). These supporting documents are currently in Chinese. This repository does not distribute the original IEC or TRS PDFs.

Results are estimates for the specified model and source conditions. Residuals against standard table values, JS/Python consistency and conformity of an actual installation are evaluated separately. The individual RQR-M HVL criterion uses an absolute tolerance of ±0.02 mm Al. A uniform 2% threshold for nominal HVL residuals cannot replace the standard's procedure for establishing radiation qualities.

The author will specify the usage license for this repository's code separately. Third-party data remain subject to their respective licenses.
