"""
Genera los datos geográficos (países, estados/regiones y códigos postales) que usa el alta de
propiedades. Fuente: GeoNames (https://www.geonames.org), licencia CC BY 4.0.

    python manage.py build_geodata            # descarga y genera backend/core/geo_data/
    python manage.py build_geodata --src /tmp/geo   # usa archivos ya descargados

Los archivos generados se versionan junto al código; solo hay que volver a correr el comando
para refrescar los datos.
"""
import gzip
import io
import json
import os
import urllib.request
import zipfile
from collections import Counter, defaultdict

from django.core.management.base import BaseCommand

from core import geo

BASE = 'https://download.geonames.org/export'
# GeoNames conserva nombres antiguos en algunos países; se corrigen a la denominación vigente.
REGION_NAME_FIXES = {
    ('MX', '09'): 'Ciudad de México',
    ('MX', '15'): 'Estado de México',
}
# Nombres oficiales largos -> nombre de uso común (coinciden con el resto de la plataforma)
NAME_FIXES = {
    ('MX', 'Michoacán de Ocampo'): 'Michoacán',
    ('MX', 'Veracruz de Ignacio de la Llave'): 'Veracruz',
    ('MX', 'Coahuila de Zaragoza'): 'Coahuila',
}


def _fetch(src, name, url):
    path = os.path.join(src, name)
    if not os.path.isfile(path):
        os.makedirs(src, exist_ok=True)
        urllib.request.urlretrieve(url, path)  # noqa: S310 (URL fija de GeoNames)
    return path


class Command(BaseCommand):
    help = 'Construye backend/core/geo_data con países, regiones y códigos postales (GeoNames).'

    def add_arguments(self, parser):
        parser.add_argument('--src', default='/tmp/geonames', help='Carpeta de descarga / caché de GeoNames')

    def handle(self, *args, **opts):
        src = opts['src']
        out_dir = geo.DATA_DIR
        os.makedirs(os.path.join(out_dir, 'postal'), exist_ok=True)

        info_path = _fetch(src, 'countryInfo.txt', f'{BASE}/dump/countryInfo.txt')
        adm_path = _fetch(src, 'admin1CodesASCII.txt', f'{BASE}/dump/admin1CodesASCII.txt')
        zip_path = _fetch(src, 'allCountries.zip', f'{BASE}/zip/allCountries.zip')

        countries = {}
        with open(info_path, encoding='utf-8') as fh:
            for line in fh:
                if line.startswith('#') or not line.strip():
                    continue
                p = line.rstrip('\n').split('\t')
                if len(p) < 5 or not p[0]:
                    continue
                countries[p[0]] = {'code': p[0], 'name_en': p[4], 'postal_regex': p[14] if len(p) > 14 else '',
                                   'postal_format': p[13] if len(p) > 13 else ''}

        admin1 = defaultdict(list)
        with open(adm_path, encoding='utf-8') as fh:
            for line in fh:
                p = line.rstrip('\n').split('\t')
                if len(p) < 2 or '.' not in p[0]:
                    continue
                cc, code = p[0].split('.', 1)
                admin1[cc].append([code, p[1]])

        # Códigos postales por país
        rows = defaultdict(list)
        with zipfile.ZipFile(zip_path) as zf:
            with zf.open('allCountries.txt') as raw:
                for line in io.TextIOWrapper(raw, encoding='utf-8'):
                    p = line.rstrip('\n').split('\t')
                    if len(p) < 9 or not p[1]:
                        continue
                    rows[p[0]].append(p)

        total_codes = 0
        regions_out = {}
        has_postal = set()
        for cc, items in rows.items():
            a1 = {}
            a2, a3 = {}, {}
            by_postal = defaultdict(lambda: {'a1': Counter(), 'a2': Counter(), 'a3': Counter(), 'places': []})
            for p in items:
                postal, place = p[1].strip(), p[2].strip()
                n1, c1, n2, n3 = p[3].strip(), p[4].strip(), p[5].strip(), p[7].strip()
                key1 = c1 or n1
                if n1 or c1:
                    nm = REGION_NAME_FIXES.get((cc, c1), n1 or c1)
                    a1.setdefault(key1, [c1, NAME_FIXES.get((cc, nm), nm)])
                rec = by_postal[postal]
                rec['a1'][key1] += 1
                rec['a2'][n2] += 1
                rec['a3'][n3] += 1
                if place and place not in rec['places']:
                    rec['places'].append(place)
            a1_list = sorted(a1.values(), key=lambda r: r[1].lower())
            a1_idx = {(r[0] or r[1]): i for i, r in enumerate(a1_list)}
            a2_list, a3_list = [], []

            def idx(lst, val):
                if not val:
                    return -1
                if val not in lst:
                    lst.append(val)
                return lst.index(val)

            postal_map = {}
            for postal, rec in by_postal.items():
                k1 = rec['a1'].most_common(1)[0][0]
                m2 = rec['a2'].most_common(1)[0][0]
                m3 = rec['a3'].most_common(1)[0][0]
                postal_map[postal] = [a1_idx.get(k1, -1), idx(a2_list, m2), idx(a3_list, m3), sorted(rec['places'], key=str.lower)]
            payload = {'a1': a1_list, 'a2': a2_list, 'a3': a3_list, 'p': postal_map}
            with gzip.open(os.path.join(out_dir, 'postal', f'{cc}.json.gz'), 'wt', encoding='utf-8', compresslevel=9) as fh:
                json.dump(payload, fh, ensure_ascii=False, separators=(',', ':'))
            total_codes += len(postal_map)
            has_postal.add(cc)
            if a1_list:
                regions_out[cc] = a1_list

        # Regiones: las del dataset postal (coinciden con las consultas); si no hay, las de GeoNames admin1
        for cc, regs in admin1.items():
            if cc not in regions_out:
                regions_out[cc] = sorted(([c, REGION_NAME_FIXES.get((cc, c), n)] for c, n in regs), key=lambda r: r[1].lower())

        index = {
            'attribution': 'Datos geográficos © GeoNames (geonames.org), licencia CC BY 4.0',
            'countries': [
                {'code': c['code'], 'name_en': c['name_en'], 'has_postal': c['code'] in has_postal,
                 'postal_format': c['postal_format']}
                for c in sorted(countries.values(), key=lambda x: x['name_en'])
            ],
            'regions': regions_out,
        }
        with open(os.path.join(out_dir, 'index.json'), 'w', encoding='utf-8') as fh:
            json.dump(index, fh, ensure_ascii=False, separators=(',', ':'))
        with open(os.path.join(out_dir, 'ATTRIBUTION.txt'), 'w', encoding='utf-8') as fh:
            fh.write('Postal codes, countries and administrative divisions from GeoNames (https://www.geonames.org), '
                     'licensed under Creative Commons Attribution 4.0.\n')
        self.stdout.write(self.style.SUCCESS(
            f'{len(index["countries"])} países · {len(has_postal)} con códigos postales ({total_codes:,} CP) · '
            f'{sum(len(v) for v in regions_out.values()):,} regiones'))
