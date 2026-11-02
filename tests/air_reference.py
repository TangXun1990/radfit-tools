#!/usr/bin/env python3
"""Independent distance reference using the frozen Python source spectra.

Read cases on stdin and write JSON to stdout.  Distances are in metres; Mo
uses the measured 1 m PTB spectrum as its starting point.  The independent
Beer–Lambert weighting and narrow-beam HVL integration are implemented here,
without changing or refitting any of the reference model parameters.
"""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import iso_reference_model as iso  # noqa: E402
import diagnostic_model as diagnostic  # noqa: E402
import mo_model as mo  # noqa: E402

ISO_PARAMS = json.loads((ROOT / 'iso_fitted_params.json').read_text(encoding='utf-8'))


def reference(case):
    p, kind = case['p'], case['kind']
    distance = float(case['distance'])
    if kind == 'iso':
        args = {key: p[key] for key in ('kvp', 'ang', 'inh', 'fAl', 'fCu', 'fSn', 'fPb')}
        energy, p0, filtered = iso.spectrum(p=ISO_PARAMS, **args)
        material = case['material']
        delta = distance
    elif p['target'] == 'W':
        data = diagnostic.calculate(p, include_spectrum=True)
        energy = np.asarray(data['E'], dtype=float)
        p0 = np.asarray(data['p0'], dtype=float)
        filtered = np.asarray(data['pF'], dtype=float)
        material = 'Al'
        delta = distance
    else:
        energy, p0, filtered = mo.spectrum(p['kvp'], mo_mm=p['fMo'], al_mm=p['fAl'])
        energy = np.asarray(energy, dtype=float)
        count = int(np.count_nonzero(energy + 0.125 <= p['kvp'] + 1e-12))
        energy = energy[:count]
        p0 = np.asarray(p0[:count], dtype=float)
        filtered = np.asarray(filtered[:count], dtype=float)
        material = 'Al'
        delta = distance - 1.0

    # Air attenuation uses the TOTAL mass attenuation coefficient, not mu_en.
    optical_depth = iso.interp('Air', energy, 1) * iso.RHO['Air'] * (100.0 * delta)
    with np.errstate(under='ignore'):
        measured = filtered * np.exp(-optical_depth)
    weight = energy * iso.interp('Air', energy, 2) * iso.RHO['Air']
    k = float(np.sum(measured * weight))
    if not (k > 0 and np.isfinite(k)):
        return {'energy': energy.tolist(), 'pF': measured.tolist(), 'empty': True}
    mu = iso.interp(material, energy, 1) * iso.RHO[material] / 10.0

    def thickness(fraction):
        low, high = 0.0, 1.0
        while np.sum(measured * weight * np.exp(-mu * high)) / k > fraction:
            high *= 2
            if high > 5000:
                return None
        for _ in range(90):
            mid = (low + high) / 2
            if np.sum(measured * weight * np.exp(-mu * mid)) / k > fraction:
                low = mid
            else:
                high = mid
        return (low + high) / 2

    hv1, t25 = thickness(.5), thickness(.25)
    total, energy_total = float(np.sum(measured)), float(np.dot(energy, measured))
    return {
        'energy': energy.tolist(), 'pF': measured.tolist(), 'empty': False,
        'hv1': hv1, 'hv2': t25 - hv1,
        'eF': energy_total / total,
        'eP': float(np.dot(energy * energy, measured)) / energy_total,
    }


def main():
    cases = json.load(sys.stdin)
    json.dump([reference(case) for case in cases], sys.stdout, allow_nan=False)


if __name__ == '__main__':
    main()
