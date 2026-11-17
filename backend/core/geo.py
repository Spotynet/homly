"""Consulta de países, regiones y códigos postales (datos GeoNames generados por `build_geodata`)."""
import gzip
import json
import os
import re
from functools import lru_cache

DATA_DIR = os.path.join(os.path.dirname(__file__), 'geo_data')


@lru_cache(maxsize=1)
def _index():
    path = os.path.join(DATA_DIR, 'index.json')
    if not os.path.isfile(path):
        return {'countries': [], 'regions': {}}
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


@lru_cache(maxsize=6)
def _postal_file(cc):
    path = os.path.join(DATA_DIR, 'postal', f'{cc}.json.gz')
    if not os.path.isfile(path):
        return None
    with gzip.open(path, 'rt', encoding='utf-8') as fh:
        return json.load(fh)


def countries():
    return _index()['countries']


def regions(cc):
    return [{'code': c, 'name': n} for c, n in _index()['regions'].get((cc or '').upper(), [])]


def _candidates(cc, raw):
    code = re.sub(r'\s+', ' ', (raw or '').strip().upper())
    out = [code, code.replace(' ', ''), code.replace('-', '')]
    if ' ' in code:
        out.append(code.split(' ')[0])
    if '-' in code:
        out.append(code.split('-')[0])
    if cc == 'CA':
        out.append(code.replace(' ', '')[:3])
    if cc == 'GB':
        out.append(code.replace(' ', '')[:-3].strip() if len(code.replace(' ', '')) > 3 else code)
    if re.fullmatch(r'\d{8}', code):
        out.append(f'{code[:5]}-{code[5:]}')
    if cc == 'AR':
        m = re.search(r'\d{4}', code)
        if m:
            out.append(m.group(0))
    if cc == 'NL':
        out.append(code.replace(' ', '')[:4])
    if cc == 'IE':
        out.append(code.replace(' ', '')[:3])
    seen, res = set(), []
    for c in out:
        if c and c not in seen:
            seen.add(c)
            res.append(c)
    return res


def lookup_postal(cc, raw):
    """Devuelve estado, municipio/delegación, ciudad y colonias del código postal, o None."""
    cc = (cc or '').upper()
    data = _postal_file(cc)
    if not data:
        return None
    for cand in _candidates(cc, raw):
        rec = data['p'].get(cand)
        if not rec:
            continue
        a1, a2, a3, places = rec
        region = data['a1'][a1] if 0 <= a1 < len(data['a1']) else None
        municipality = data['a2'][a2] if a2 >= 0 else ''
        city = data['a3'][a3] if a3 >= 0 else ''
        return {
            'country_code': cc, 'postal_code': cand,
            'state': {'code': region[0], 'name': region[1]} if region else None,
            'municipality': municipality or city,
            'city': city or municipality,
            'places': places,
        }
    return None
