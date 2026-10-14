# -*- coding: utf-8 -*-
"""Independent Mo model: measured PTB basis spectra + physical filtration.

No original ISO parameters are imported or changed.  Stdlib only.
Photon-array entries are per-bin photon weights, not densities per keV.
The PTB basis already includes its fixed 1 mm Be window and 1 m air path.
"""
from pathlib import Path
import bisect
import json
import math

HERE = Path(__file__).resolve().parent
DATA = json.loads((HERE / 'mo_reference_spectra.json').read_text(encoding='utf-8'))
MU = DATA['attenuation_tables']
RHO = DATA['densities_g_per_cm3']
E_GRID = DATA['grid']['energy_keV']


def interp(mat, energy_keV, col=1):
    """对数插值；吸收边重复能量在边点取边后值，边下区间取边前值。"""
    table = MU[mat]
    x = energy_keV / 1000.0
    if not math.isfinite(x) or x <= 0:
        raise ValueError('Energy must be positive and finite')
    if x < table[0][0]:
        return table[0][col]
    if x >= table[-1][0]:
        return table[-1][col]
    i = bisect.bisect_right([row[0] for row in table], x) - 1
    if x == table[i][0]:
        return table[i][col]
    a, b = table[i], table[i + 1]
    t = math.log(x / a[0]) / math.log(b[0] / a[0])
    return math.exp(math.log(a[col]) + t * math.log(b[col] / a[col]))


def basis_spectrum(kvp):
    """同一分箱的钼靶实测基谱按电压线性插值，不改动特征峰位置。"""
    kvp = float(kvp)
    if not math.isfinite(kvp) or not 25 <= kvp <= 35:
        raise ValueError('Mo reference model supports 25–35 kV only')
    basis = DATA['basis_spectra']
    lo = basis[0]
    hi = basis[-1]
    for a, b in zip(basis, basis[1:]):
        if a['kvp'] <= kvp <= b['kvp']:
            lo, hi = a, b
            break
    t = (kvp - lo['kvp']) / (hi['kvp'] - lo['kvp'])
    weights = [(1 - t) * a + t * b for a, b in zip(lo['photon_bin_weights'], hi['photon_bin_weights'])]
    # 第一列原为箱上界，完整分箱须不超过管电压端点。
    weights = [p if e + .125 <= kvp + 1e-12 else 0.0 for e, p in zip(E_GRID, weights)]
    total = sum(weights)
    if total <= 0:
        raise ValueError('Interpolated Mo spectrum is empty')
    return list(E_GRID), [p / total for p in weights]


def spectrum(kvp, mo_mm=.032, al_mm=0, extra_be_mm=0):
    """对已含 Be 窗/空气的基谱施加新增 Mo/Al/Be 过滤，厚度单位 mm。"""
    limits = {'Mo': (mo_mm, 0, .1), 'Al': (al_mm, 0, 50), 'Be': (extra_be_mm, 0, 10)}
    for name, (value, low, high) in limits.items():
        if not math.isfinite(value) or not low <= value <= high:
            raise ValueError(f'{name} filter thickness must be {low}–{high} mm')
    E, p0 = basis_spectrum(kvp)
    pF = []
    for e, p in zip(E, p0):
        at = sum(interp(mat, e) * RHO[mat] * thick / 10 for mat, thick in [('Mo', mo_mm), ('Al', al_mm), ('Be', extra_be_mm)] if thick)
        pF.append(p * math.exp(-at))
    return E, p0, pF


def summarize_spectrum(E, p0, pF):
    """以空气能量吸收系数加权求 HVL；HVL2 表示从50%至25%的增量。"""
    if not len(E) == len(p0) == len(pF) or not E:
        raise ValueError('Spectrum arrays must have the same nonzero length')
    s0, sF = sum(p0), sum(pF)
    w = [p * e * interp('Air', e, 2) for e, p in zip(E, pF)]
    sK = sum(w)
    if s0 <= 0 or sF <= 0 or sK <= 0:
        return {'empty': True, 'hv1': None, 'hv2': None, 'mean_energy_keV': None}
    ma = [interp('Al', e) * RHO['Al'] / 10 for e in E]

    def tr(mm):
        return sum(a * math.exp(-b * mm) for a, b in zip(w, ma)) / sK

    def hvl(frac):
        # 有界扩张和二分，空谱或极端过滤返回 None，不无限循环。
        lo, hi = 0.0, 1.0
        for _ in range(64):
            if tr(hi) <= frac:
                break
            if hi >= 5000:
                return None
            hi = min(5000.0, hi * 2)
        else:
            return None
        for _ in range(80):
            mid = (lo + hi) / 2
            if tr(mid) > frac:
                lo = mid
            else:
                hi = mid
            if hi - lo <= 1e-10 * max(1.0, hi):
                break
        return (lo + hi) / 2

    h1, t25 = hvl(.5), hvl(.25)
    h2 = None if h1 is None or t25 is None else t25 - h1
    mean = sum(p * e for p, e in zip(pF, E)) / sF
    energy_spectrum_sum = sum(p * e for p, e in zip(pF, E))
    energy_weighted_mean = sum(p * e * e for p, e in zip(pF, E)) / energy_spectrum_sum
    initial_kerma = sum(p * e * interp('Air', e, 2) for e, p in zip(E, p0))
    return {'empty': False, 'hv1': h1, 'hv2': h2, 't25': t25,
            'hc': None if h2 is None or h2 <= 0 else h1 / h2,
            'mean_energy_keV': mean, 'initial_mean_energy_keV': sum(p * e for p, e in zip(p0, E)) / s0,
            'energy_weighted_mean_keV': energy_weighted_mean,
            'photon_transmission': sF / s0, 'air_kerma_transmission': sK / initial_kerma,
            'hvl_material': 'Al'}


def calculate(kvp, mo_mm=.032, al_mm=0, extra_be_mm=0):
    E, p0, pF = spectrum(kvp, mo_mm, al_mm, extra_be_mm)
    result = summarize_spectrum(E, p0, pF)
    result.update(kvp=kvp, mo_mm=mo_mm, al_mm=al_mm, extra_be_mm=extra_be_mm)
    return result


def standard_results(mo_mm=.032):
    targets = {'RQR-M': [.28, .31, .33, .36], 'RQA-M': [.56, .60, .62, .68]}
    rows = []
    for family, refs in targets.items():
        for index, (kvp, target) in enumerate(zip([25, 28, 30, 35], refs), 1):
            al = 2 if family == 'RQA-M' else 0
            row = calculate(kvp, mo_mm, al)
            row.update(name=f'{family}{index}', reference_hvl1_mm_al=target,
                       relative_deviation_percent=100 * (row['hv1'] / target - 1))
            rows.append(row)
    return rows


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mo-mm', type=float, default=.032)
    parser.add_argument('--kvp', type=float)
    parser.add_argument('--al-mm', type=float, default=0)
    args = parser.parse_args()
    value = standard_results(args.mo_mm) if args.kvp is None else calculate(args.kvp, args.mo_mm, args.al_mm)
    print(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False))
