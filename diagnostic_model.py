# -*- coding: utf-8 -*-
"""独立诊断 W 靶模型；只读取原 ISO 模型，不修改原拟合参数。"""
import importlib.util
import json
import math
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('iso_reference', HERE / 'iso_reference_model.py')
iso = importlib.util.module_from_spec(spec)
spec.loader.exec_module(iso)
MU = iso.MU
RHO = iso.RHO
ISO_PARAMS = json.loads((HERE / 'diagnostic_w_params.json').read_text(encoding='utf-8'))['physical_parameters']
IEC_DATA = json.loads((HERE / 'iec61267-2005.json').read_text(encoding='utf-8'))
W_QUALITIES = [q for q in IEC_DATA['qualities'] if q['family'] in ('RQR','RQA','RQT')]
RQR = [q for q in W_QUALITIES if q['family'] == 'RQR']
AL = iso._TAB[('Al', 1)] * RHO['Al'] / 10
CU = iso._TAB[('Cu', 1)] * RHO['Cu'] / 10

def find_hvl(E, phi, fraction=0.5, material='Al'):
    """有界二分求空气比释动能半值层；无有效谱时返回 None。"""
    weights = phi * E * iso.interp('Air', E, 2) * RHO['Air']
    total = float(weights.sum())
    if not math.isfinite(total) or total <= 0 or not 0 < fraction < 1:
        return None
    attenuation = iso.interp(material, E, 1) * RHO[material] / 10
    def tr(t):
        return float(np.dot(weights, np.exp(-attenuation*t))) / total
    low, high = 0.0, 0.001
    for _ in range(64):
        if tr(high) <= fraction:
            break
        high = min(high*1.5, 5000.0)
    else:
        return None
    if tr(high) > fraction:
        return None
    for _ in range(80):
        mid = (low+high)/2
        if tr(mid) > fraction:
            low = mid
        else:
            high = mid
        if high-low <= 1e-10 * max(1.0, high):
            break
    return (low+high)/2

def calculate(case, params=None, include_spectrum=False):
    """诊断预设一律用 Al 报告 HVL；能谱归一化不改变空气比释动能 HVL。"""
    if params is None:
        params = ISO_PARAMS
    args = {k:case.get(k, 0.0) for k in ('kvp','ang','inh','fAl','fCu','fSn','fPb')}
    args['ang'] = case.get('ang', 20.0)
    args['fAl'] += case.get('baseAl', 0.0)
    E, p0, pF = iso.spectrum(p=params, **args)
    hv1 = find_hvl(E,pF,0.5)
    t25 = find_hvl(E,pF,0.25)
    if hv1 is None or t25 is None:
        result = {'mat':'Al','empty':True,'hv1':None,'hv2':None,'hc':None,'eF':None,'eP':None}
    else:
        hv2 = t25-hv1
        total = float(pF.sum())
        first = float(np.dot(E,pF))
        result = dict(mat='Al',empty=False,hv1=hv1,hv2=hv2,hc=hv1/hv2 if hv2>0 else None,eF=first/total,eP=float(np.dot(E*E,pF))/first)
    if include_spectrum:
        result.update(E=E.tolist(),p0=p0.tolist(),pF=pF.tolist())
    return result

def baseline_filter(kvp,target_hvl,params):
    """调节模型等效总 Al 过滤至 RQR 目标 HVL，不把它称为标准固定过滤。"""
    E, p0, _ = iso.spectrum(kvp,ang=20,inh=0,p=params)
    weights = p0*iso._wt(E)
    alpha = AL[:len(E)]
    half = np.exp(-alpha*target_hvl)
    def residual(filt):
        atten = weights*np.exp(-alpha*filt)
        return float(np.dot(atten,half))/float(atten.sum())-.5
    if residual(0) > 0:
        return 0.0
    lo,hi = 0.0,50.0
    if residual(hi) < 0:
        return None
    for _ in range(50):
        mid=(lo+hi)/2
        if residual(mid)>0:
            hi=mid
        else:
            lo=mid
    return (lo+hi)/2

def make_cases(params):
    filters={q['number']:baseline_filter(q['kvp'],q['hvl1_mm_al'],params) for q in RQR}
    cases=[]
    for q in W_QUALITIES:
        add=q['physical_config'].get('additional_filter',{})
        case={'name':q['name'],'family':q['family'],'number':q['number'],'kvp':q['kvp'],'ang':20.0,'inh':0.0,'target':'W','baseAl':filters[q['number']],'fAl':add.get('thickness_mm',0) if add.get('material')=='Al' else 0,'fCu':add.get('thickness_mm',0) if add.get('material')=='Cu' else 0,'fMo':0.0,'fSn':0.0,'fPb':0.0,'mat':'Al','base_filter_al_mm':filters[q['number']],'additional_filter':add,'reference_hvl1_mm_al':q['hvl1_mm_al'],'reference_homogeneity':q.get('homogeneity')}
        cases.append(case)
    return cases

def export_reference():
    """保存可复现的诊断 W 过滤校准及 Python 能谱数值；原 ISO 常数保持原值。"""
    cases = make_cases(ISO_PARAMS)
    records = []
    for c in cases:
        r=calculate(c)
        print(c['name'], 'baseAl', round(c['base_filter_al_mm'],5), 'HVL',round(r['hv1'],5),'deviation%',round((r['hv1']/c['reference_hvl1_mm_al']-1)*100,3),'h',round(r['hc'],5),'hRef',c['reference_homogeneity'])
        r['hvl1_deviation_percent'] = (r['hv1']/c['reference_hvl1_mm_al']-1)*100
        r['homogeneity_absolute_deviation'] = r['hc']-c['reference_homogeneity'] if c['reference_homogeneity'] is not None else None
        records.append({'case':c,'summary':r,'spectrum':calculate(c, include_spectrum=True)})
    base = {c['name']:c['baseAl'] for c in cases if c['family']=='RQR'}
    kvpbase = {str(c['kvp']):c['baseAl'] for c in cases if c['family']=='RQR'}
    output = {
        'model':'Birch-Marshall W target diagnostic estimate',
        'standard':'IEC 61267:2005 and IAEA TRS 457',
        'status':'calibrated_rqr_equivalent_Al_filters',
        'physical_parameters':ISO_PARAMS,
        'physical_parameters_changed':False,
        'angle_deg':20.0,
        'hvl_material':'Al',
        'rqr_base_filtration_mm_al':base,
        'rqr_base_filtration_by_kvp_mm_al':kvpbase,
        'calibration_method':{
            'variable':'equivalent total source-assembly Al filtration, one value per RQR voltage',
            'objective':'air-kerma transmission at reference RQR HVL1 = 0.5',
            'solver':'bounded bisection, 50 iterations, 0 to 50 mm Al',
            'fitted_physical_coefficients':False,
            'spectrum_energy_step_keV':1.0,
            'parameter_origin':'Unchanged fitted W physical parameters from ISO calculator; original file SHA256 77cbcead63ce23ce6393fa349aa6732c8c077ca86ae9de554a2cf224aed64a47',
            'homogeneity_check':'All RQR homogeneity differences are within the +/- 0.03 reference interval; values are computed from the same model spectrum.',
            'nominal_hvl_scope':'RQA and RQT inherit matching RQR baseline and add prescribed filters. Their tabulated HVL1 values are nominal; model/reference deviations are retained, not eliminated by altering prescribed filters.'
        },
        'additional_conditions':{
            'RQR':{'target':'W','maximum_ripple_percent':10,'baseline_model':'calibrated equivalent Al source filtration','additional_filter':None},
            'RQA':{'target':'W','maximum_ripple_percent':10,'baseline_model':'matching RQR','added_al_mm_by_number':{str(c['number']):c['fAl'] for c in cases if c['family']=='RQA'}},
            'RQT':{'target':'W','maximum_ripple_percent':10,'baseline_model':'matching RQR','added_cu_mm_by_number':{str(c['number']):c['fCu'] for c in cases if c['family']=='RQT'}}
        },
        'limitations':[
            'Estimated spectra are not unique spectra determined by IEC HVL constraints and are not measured absolute-output calibrations.',
            'Angle 20 degrees and constant potential are model assumptions; permitted voltage ripple is documented but not simulated.',
            'RQR equivalent Al thickness is inferred by this model, not a universal filtration thickness specified by the standard.',
            'HVL agreement and homogeneity consistency do not certify a real generator, geometry, filter purity, or instrument response.',
            'RQA/RQT nominal HVL residuals are not universal 2 percent acceptance limits; the less-than-2-percent requirement is JS/Python implementation consistency.'
        ],
        'cases':cases
    }
    report = {
        'status':'Python reference spectra ready for independent JS comparison',
        'case_count':len(records),
        'physical_parameters_changed':False,
        'rqr_homogeneity_max_abs_deviation':max(abs(r['summary']['homogeneity_absolute_deviation']) for r in records if r['case']['family']=='RQR'),
        'rqr_all_homogeneity_within_0_03':all(abs(r['summary']['homogeneity_absolute_deviation'])<=.03 for r in records if r['case']['family']=='RQR'),
        'family_max_abs_hvl1_reference_deviation_percent':{fam:max(abs(r['summary']['hvl1_deviation_percent']) for r in records if r['case']['family']==fam) for fam in ('RQR','RQA','RQT')},
        'records':records
    }
    (HERE/'diagnostic_w_params.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
    (HERE/'.validation'/'w_model_results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')

if __name__ == '__main__':
    # 默认只输出现有参数的参考结果，不重新校准或覆盖参数文件。
    saved = json.loads((HERE/'diagnostic_w_params.json').read_text(encoding='utf-8'))
    results = [{'name': c['name'], 'result': calculate(c)} for c in saved['cases']]
    print(json.dumps({'model': saved['model'], 'results': results}, ensure_ascii=False, indent=2))
