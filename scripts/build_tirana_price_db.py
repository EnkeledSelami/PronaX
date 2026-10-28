#!/usr/bin/env python3
"""Build a reproducible local Tirana price database from retained source snapshots."""
import csv
import hashlib
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'data-source' / 'market-prices'
RAW = BASE / 'raw'
DB = BASE / 'tirana-prices.sqlite'
OSM_POINTS = RAW / 'prona_neighbourhood_osm_points.json'
GPKG = ROOT / 'data-source' / 'albania.gpkg'
BUILT_AT = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
SNAPSHOT = '2026-10-28'

SOURCES = [
 ('prona_neighbourhoods','Prona market-price aggregates','Prona','https://pronatirana.com/en/cmimet','https://pronatirana.com/en/cmimet/csv?deal=sale','Derived aggregate figures are freely reusable with attribution per Prona developer API terms; listing content/photos are not.','attribution_required','Source: Prona (pronatirana.com).','Sale listing aggregates; neighbourhood is nearest named OSM neighbourhood within 900 m; exported CSV does not identify property-type filter.'),
 ('vatreja_city','Vatreja Tirana daily city series','Vatreja','https://vatreja.com/press','https://vatreja.com/en/markets/AL/Tiran%C3%AB.csv','Free to use with attribution per Vatreja press page.','attribution_required','Source: Vatreja.com.','Daily, city-level asking price and inventory; not neighbourhood-level.'),
 ('vatreja_q3','Vatreja Q3 2026 city CSV','Vatreja','https://vatreja.com/press','https://kova.nyc3.cdn.digitaloceanspaces.com/vatreja/reports/quarterly/vatreja-q3-2026.csv','Free to use with attribution per Vatreja press page.','attribution_required','Source: Vatreja.com.','Quarterly city-level context; not neighbourhood-level.'),
 ('domlivo_tirana','Domlivo Tirana district price index','Domlivo Price Index','https://www.domlivo.com/en/methodology','https://www.domlivo.com/data/prices/tirana.csv','Creative Commons Attribution 4.0 International (CC BY 4.0).','cc_by_4.0','Domlivo Price Index, Tirana, 2026-10-28, https://www.domlivo.com/en/methodology.','Apartments and studios for sale on Domlivo. The source flags samples below its 30-flat threshold; suppress their headline prices.'),
 ('balkanhome_q3','BalkanHome apartments Q3 2026 report CSV','BalkanHome.eu','https://www.balkanhome.eu/en/report/albania-apartment-prices-q3-2026','https://www.balkanhome.eu/report/q3-2026/balkanhome-albania-apartments-q3-2026-data.csv','Report grants free use for media with attribution; wider commercial product reuse is not established.','pending_commercial_reuse_scope','Source: BalkanHome.eu, https://www.balkanhome.eu/en/report/albania-apartment-prices-q3-2026.','Quarterly asking-price data for one marketplace. Retained for research but blocked from product display until reuse scope is confirmed.'),
 ('ashk_vkm457','Official Tirana residential reference prices, VKM 457/2023 Annex 1 a.2','Council of Ministers / ASHK','https://www.ashk.gov.al/2024/01/19/vendim-nr-457-date-26-7-2023-per-disa-ndryshime-ne-vendimin-nr-132-date-7-3-2018-te-keshillit-te-ministrave-per-metodologjine-per-percaktimin-e-vleres-se-taksueshme-te-pasurise-se-palua/','https://www.ashk.gov.al/wp-content/uploads/2024/01/vendim-2023-07-26-457.pdf','Official legal act; tax reference values, not market prices. Applicability is subject to the act and subsequent constitutional decision.','official_reference_only','Source: Council of Ministers Decision no. 457, 26 July 2023, Annex 1 a.2 (ASHK).','32 cadastral zone values and 13 municipal administrative unit values in ALL/m²; the act does not include boundaries.'),
 ('keydata_q2_2026','Keydata Tirana unit index Q2 2026, published table','Keydata Albania / Hyrja','https://hyrja.al/en/blog/apartment-prices-tirana-by-area-2026','','Published aggregate table; credit Keydata and cited publication. Underlying index reuse terms are not fully documented.','attribution_scope_unclear','Source: Keydata Albania, as published by Hyrja.al citing Shekulli, 4 Aug 2026.','Average apartment price €/m² by administrative unit; mixes new build and resale. Unit 1 omitted because the published figures conflict.'),
 ('osm_geofabrik','OpenStreetMap Albania Geofabrik extract','OpenStreetMap / Geofabrik','https://download.geofabrik.de/europe/albania.html','','OpenStreetMap data under ODbL 1.0; attribution required.','odbl_1.0','© OpenStreetMap contributors; extract via Geofabrik, downloaded 2026-10-27.','Administrative-unit boundary geometry from the locally bundled Albania GeoPackage; source label joins by OSM administrative-unit number.'),
 ('osm_nominatim','OpenStreetMap Nominatim neighbourhood label points','OpenStreetMap contributors','https://nominatim.openstreetmap.org/','','OpenStreetMap data under ODbL 1.0; attribution required.','odbl_1.0','© OpenStreetMap contributors; one-time Nominatim label-point snapshot, 2026-10-28.','Coordinates are search-result label anchors only; they are not neighbourhood boundary geometries.'),
 ('boalbania_hpi','Bank of Albania Real Estate Market Survey / Housing Price Index','Bank of Albania','https://www.bankofalbania.org/Financial_Stability/Analysis_and_studies/Surveys/Survey_on_the_developments_in_the_real_estate_market_in_Albania.html','','No dataset-specific redistribution licence verified. Aggregate survey only.','research_context_only','Source: Bank of Albania.','Semiannual, non-exhaustive survey; aggregate Tirana/national context, not neighbourhood-level prices.'),
 ('asig_boundaries','ASIG administrative boundary layers','State Authority for Geospatial Information','https://geoportal.asig.gov.al/en/data/datasets','','Dataset-specific licence and bulk-download terms remain unverified; downloads may require registration.','boundary_source_pending','Source: ASIG Geoportal.','Potential authoritative boundary crosswalk; inspect layer metadata, licence, geometry and update date before bundling.'),
 ('gjk_decision_78_2024','Constitutional Court Decision no. 78/2024','Constitutional Court of Albania','https://www.gjykatakushtetuese.gov.al/vendime-perfundimtare-shtator-2024/','','Legal context for applicability of parts of VKM 457/2023; not a price dataset.','legal_context_only','Source: Constitutional Court of Albania, Decision no. 78, 6 Nov 2024.','Read alongside the official reference-price act before any tax-related use.'),
]

CADASTRAL = [('1/1',102800),('1/2',97200),('2/1',202400),('2/2',148400),('2/3',110600),('2/4',120300),('2/5',85700),('3/1',98500),('3/2',86300),('4/1',95900),('4/2',95300),('5/1',228400),('5/2',175800),('5/3',164800),('5/4',117800),('6',81700),('7/1',159100),('7/2',123400),('7/3',124500),('7/4',114300),('8/1',145650),('8/2',156700),('8/3',89900),('9/1',163600),('9/2',135800),('9/3',113850),('10/1',192800),('10/2',178300),('10/3',121200),('11/1',113000),('11/2',103500),('11/3',93600)]
ADMIN = [('Baldushk',32000),('Bërzhitë',34000),('Dajt',75500),('Farkë',115200),('Kashar',69000),('Kërrabë',28200),('Ndroq',34000),('Petrelë',85800),('Pezë',85800),('Shëngjergj',23000),('Vaqar',34000),('Zall-Bastar',25000),('Zall-Herr',28200)]
KEYDATA = [('Former Blloku',2962,'Unit 5 subset; overlapping index geography'),('Unit 10',2515,'Myslym Shyri, Embassy area, Rruga e Durrësit'),('Unit 5',2514,'Former Blloku, lake, Komuna e Parisit'),('Unit 2',2306,'Pyramid, Pazari i Ri, Bërryli, Student City, Selitë'),('Unit 7',2131,'Court street, Embassy area, Unaza e Re, Yzberish'),('Unit 9',2127,'Zogu I Blvd, Barrikadave, old station, Don Bosko'),('Unit 3',1796,'Xhamllëku, Bardhyl, Porcelani, Kinostudio, Linzë'),('Unit 8',1786,'Selvia, Medreseja, Tregu Industrial'),('Unit 4',1759,'Hospital complex, Oxhaku, Alliasi, Tufinë'),('Unit 6',1687,'Kombinat, Vaqarr, Selitë, Yzberish, Sharrë'),('Unit 11',1530,'Zogu i Zi, Ferlut, Laprakë, Fushë Mëzes')]

def rows(filename):
    with (RAW / filename).open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))

def slug(text):
    text=text.casefold().strip().replace('ë','e').replace('ç','c')
    return re.sub(r'[^a-z0-9]+','-',text).strip('-')

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
    return h.hexdigest()

if DB.exists(): DB.unlink()
db=sqlite3.connect(DB)
db.executescript('''
PRAGMA foreign_keys=ON;
CREATE TABLE data_sources(source_id TEXT PRIMARY KEY,name TEXT,publisher TEXT,page_url TEXT,data_url TEXT,license_or_terms TEXT,reuse_status TEXT,attribution TEXT,method_notes TEXT);
CREATE TABLE dataset_files(file_id INTEGER PRIMARY KEY,source_id TEXT REFERENCES data_sources,relative_path TEXT,sha256 TEXT,bytes INTEGER,downloaded_at TEXT,snapshot_date TEXT);
CREATE TABLE areas(area_id TEXT PRIMARY KEY,name TEXT,area_type TEXT,parent_area_id TEXT REFERENCES areas,source_label TEXT,geometry_source TEXT,geometry_ref TEXT,geometry_status TEXT,notes TEXT);
CREATE TABLE area_geometries(geometry_id INTEGER PRIMARY KEY,area_id TEXT REFERENCES areas,source_id TEXT REFERENCES data_sources,geometry_type TEXT,geojson TEXT,latitude REAL,longitude REAL,source_feature_id TEXT,geometry_status TEXT,notes TEXT,UNIQUE(area_id,source_id));
CREATE TABLE area_relationship_candidates(parent_area_id TEXT REFERENCES areas,child_area_id TEXT REFERENCES areas,relationship TEXT,status TEXT,notes TEXT,PRIMARY KEY(parent_area_id,child_area_id));
CREATE TABLE observations(observation_id INTEGER PRIMARY KEY,source_id TEXT REFERENCES data_sources,area_id TEXT REFERENCES areas,indicator TEXT,statistic TEXT,value REAL,unit TEXT,period_start TEXT,period_end TEXT,snapshot_date TEXT,sample_count INTEGER,sample_status TEXT,property_scope TEXT,publication_status TEXT,source_row TEXT,notes TEXT);
CREATE INDEX observations_lookup ON observations(area_id,indicator,period_end,snapshot_date);
CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);
CREATE VIEW v_tirana_neighbourhood_market_prices AS
 SELECT a.area_id,a.name,
   MAX(CASE WHEN o.statistic='median' THEN o.value END) AS median_eur_per_m2,
   MAX(CASE WHEN o.statistic='p25' THEN o.value END) AS p25_eur_per_m2,
   MAX(CASE WHEN o.statistic='p75' THEN o.value END) AS p75_eur_per_m2,
   MAX(o.sample_count) AS listing_count,
   MAX(o.snapshot_date) AS downloaded_on,
   MAX(o.publication_status) AS publication_status
 FROM areas a JOIN observations o ON o.area_id=a.area_id
 WHERE o.source_id='prona_neighbourhoods' AND o.indicator='asking_price_per_sqm'
 GROUP BY a.area_id,a.name;
CREATE VIEW v_tirana_official_reference_prices AS
 SELECT a.area_id,a.name,a.area_type,o.value AS all_per_m2,o.publication_status,o.notes
 FROM areas a JOIN observations o ON o.area_id=a.area_id
 WHERE o.source_id='ashk_vkm457' AND o.indicator='tax_reference_residential_value_per_sqm';
''')
db.executemany('INSERT INTO data_sources VALUES(?,?,?,?,?,?,?,?,?)',SOURCES)
area_ids=set()
osm_point_rows={}
if OSM_POINTS.exists():
    osm_point_rows={r['name'].casefold():r for r in json.loads(OSM_POINTS.read_text(encoding='utf-8')).get('points',[])}
def area(aid,name,kind,parent='tirana',label=None,geo_src=None,geo_ref=None,geo_status='not_joined',notes=None):
    if aid in area_ids:return
    db.execute('INSERT INTO areas VALUES(?,?,?,?,?,?,?,?,?)',(aid,name,kind,parent,label,geo_src,geo_ref,geo_status,notes)); area_ids.add(aid)
    point=osm_point_rows.get(name.casefold())
    if kind=='named_market_neighbourhood' and point and point.get('placeType') in ('quarter','neighbourhood','suburb','administrative','residential'):
        db.execute('UPDATE areas SET geometry_source=?,geometry_ref=?,geometry_status=?,notes=? WHERE area_id=?',('OpenStreetMap Nominatim',str(point.get('osmId') or ''),'point_anchor','OSM named-place label point only; not an official neighbourhood boundary.',aid))
        coords=json.dumps({'type':'Point','coordinates':[point['lon'],point['lat']]},separators=(',',':'))
        db.execute('INSERT INTO area_geometries(area_id,source_id,geometry_type,geojson,latitude,longitude,source_feature_id,geometry_status,notes) VALUES(?,?,?,?,?,?,?,?,?)',(aid,'osm_nominatim','Point',coords,point['lat'],point['lon'],str(point.get('osmId') or ''),'point_anchor','Geocoded OSM name label. Not a zone boundary.'))
def obs(source,aid,indicator,stat,value,unit,scope,status,*,start=None,end=None,snapshot=None,n=None,sample='unknown',row=None,notes=None):
    if value is None or value=='':return
    db.execute('INSERT INTO observations(source_id,area_id,indicator,statistic,value,unit,period_start,period_end,snapshot_date,sample_count,sample_status,property_scope,publication_status,source_row,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      (source,aid,indicator,stat,float(value),unit,start,end,snapshot,n,sample,scope,status,row,notes))

area('tirana','Tirana','city',None,'Tiranë',notes='Tirana root. Price source labels are not automatically equivalent to official polygons.')

# Prona: retain all 40 Tirana named-neighbourhood rows; do not fabricate neighbourhood polygons.
for i,r in enumerate(rows('prona_neighbourhoods_sale.csv')):
    if r.get('nivel')!='lagje': continue
    name=r['emri'].strip(); aid='prona-neighbourhood:'+slug(name)
    area(aid,name,'named_market_neighbourhood','tirana',name,'Prona / OSM nearest-neighbour label',None,'label_only','Not an official boundary; source assigns listings to nearest named neighbourhood within 900 m.')
    n=int(float(r.get('njoftime') or 0)); sample='adequate' if n>=30 else 'low'
    scope='Sale listings; property-type filter is not stated in exported CSV.'
    for field,stat in [('median_eur_per_m2','median'),('p25_eur_per_m2','p25'),('p75_eur_per_m2','p75')]:
        obs('prona_neighbourhoods',aid,'asking_price_per_sqm',stat,r.get(field),'EUR/m2',scope,'eligible_with_attribution',snapshot=SNAPSHOT,n=n,sample=sample,row=f'row:{i+2}',notes='Downloaded 2026-10-28; CSV has no observation date.')
    obs('prona_neighbourhoods',aid,'asking_total_price','median',r.get('median_price_eur'),'EUR',scope,'eligible_with_attribution',snapshot=SNAPSHOT,n=n,sample=sample,row=f'row:{i+2}')
    obs('prona_neighbourhoods',aid,'active_listing_count','count',n,'listings',scope,'eligible_with_attribution',snapshot=SNAPSHOT,n=n,sample=sample,row=f'row:{i+2}')

# Domlivo: preserve district rows, but enforce source's 30-flat display threshold.
for i,r in enumerate(rows('domlivo_tirana.csv')):
    name=(r.get('district') or '').strip(); aid='domlivo:'+slug(name or 'tirana')
    area(aid,name or 'Tirana (Domlivo)','market_district' if name else 'city_series','tirana' if name else None,name or 'Tirana','Domlivo Price Index',None,'label_only','Publisher-defined district; no authoritative boundary join.')
    n=int(r.get('count') or 0); low=str(r.get('low_sample','')).lower()=='true'; status='suppress_low_sample' if low else 'eligible_with_attribution'
    scope='Apartments and studios listed for sale on Domlivo.'
    for field,stat in [('median_eur_per_sqm','median'),('p20_eur_per_sqm','p20'),('p80_eur_per_sqm','p80')]:
        obs('domlivo_tirana',aid,'asking_price_per_sqm',stat,r.get(field),'EUR/m2',scope,status,snapshot=r.get('date'),n=n,sample='low' if low else 'adequate',row=f'row:{i+2}',notes='Hide headline price below source threshold.')
    obs('domlivo_tirana',aid,'active_listing_count','count',r.get('listings'),'listings',scope,'eligible_with_attribution',snapshot=r.get('date'),n=n,sample='low' if low else 'adequate',row=f'row:{i+2}')

# Vatreja daily city time series.
for i,r in enumerate(rows('vatreja_tirana.csv')):
    aid='vatreja:tirana'; area(aid,'Tirana (Vatreja city geography)','city_series','tirana','Tiranë','Vatreja',None,'label_only','Publisher-defined city geography.')
    for field,indicator,stat,unit in [('active_count','active_listing_count','count','listings'),('median_price','asking_total_price','median','EUR'),('median_price_per_m2','asking_price_per_sqm','median','EUR/m2'),('new_7d','listings_new_7d','count','listings'),('delisted_7d','listings_delisted_7d','count','listings'),('net_change_7d','listing_net_change_7d','value','listings'),('price_cut_share','price_cut_share','value','fraction'),('median_dom_days','median_days_on_market','median','days')]:
        obs('vatreja_city',aid,indicator,stat,r.get(field),unit,'Sale listings; Vatreja city-level data.','eligible_with_attribution',snapshot=r.get('snapshot_date'),sample='source_reported',row=f'row:{i+2}')

# Quarterly Vatreja city record, where the city label is available.
for i,r in enumerate(rows('vatreja_q3_2026.csv')):
    if slug(r.get('city','')) not in ('tirane','tirana'):continue
    aid='vatreja:q3:tirana'; area(aid,'Tirana (Vatreja Q3)','city_series','tirana','Tiranë','Vatreja',None,'label_only','Publisher-defined quarterly city geography.')
    for field,indicator,stat,unit in [('sale_median_eur','asking_total_price','median','EUR'),('sale_median_eur_m2','asking_price_per_sqm','median','EUR/m2'),('sale_median_m2','floor_area','median','m2'),('sale_active','active_listing_count','count','listings')]:
        obs('vatreja_q3',aid,indicator,stat,r.get(field),unit,'Sale listings; city-level publisher aggregate.','eligible_with_attribution',start='2026-07-01',end='2026-09-30',snapshot='2026-09-30',n=int(r.get('sale_active') or 0),sample='source_reported',row=f'row:{i+2}')

# BalkanHome records are normalized and queryable for research, but product use is blocked pending terms.
for i,r in enumerate(rows('balkanhome_q3_2026.csv')):
    loc=r.get('location','').strip(); loc_l=loc.casefold()
    if r.get('section')!='zone' or not ('tirana' in loc_l or loc_l in ('kashar (tirana)','farkë (tirana)','kamëz, kombinat (tirana)')):continue
    aid='balkanhome-zone:'+slug(loc); area(aid,loc,'market_zone','tirana',loc,'BalkanHome publisher zone',None,'label_only','Publisher assigns by locality/coordinates; boundary crosswalk not bundled.')
    metric=r.get('metric',''); indicator='asking_price_per_sqm' if 'per sqm' in metric else 'active_listing_count' if 'listings' in metric else 'asking_total_price' if metric=='median price' else 'median_floor_area' if metric=='median floor area' else 'market_metric'
    statistic='median' if 'median' in metric else 'p25' if metric.startswith('p25') else 'p75' if metric.startswith('p75') else 'count' if 'listings' in metric else 'value'
    obs('balkanhome_q3',aid,indicator,statistic,r.get('value'),r.get('unit',''),'Apartments for sale on BalkanHome.eu.','pending_commercial_reuse_scope',snapshot=r.get('date'),n=int(float(r['N'])) if r.get('N') else None,sample='source_reported',row=f'row:{i+2}',notes='Do not publish in-product until broader commercial reuse terms are confirmed.')

# Official tax reference values are separate from market price observations.
for code,value in CADASTRAL:
    aid='cadastral:'+code; area(aid,'Cadastral zone '+code,'official_cadastral_zone','tirana',code,'ASHK VKM 457/2023',None,'boundary_not_in_act','Decision lists value but includes no zone geometry.')
    obs('ashk_vkm457',aid,'tax_reference_residential_value_per_sqm','official_reference',value,'ALL/m2','Residential buildings; tax value, not market asking or transaction price.','official_reference_only',start='2023-07-28',snapshot='2023-07-28',sample='not_applicable',row='Annex 1 a.2 zone '+code,notes='Applicability may depend on building permit date and later legal rulings.')
for name,value in ADMIN:
    aid='admin-unit:'+slug(name); area(aid,name,'administrative_unit','tirana',name,'ASHK VKM 457/2023',None,'boundary_not_in_act','Decision lists value but includes no unit geometry.')
    obs('ashk_vkm457',aid,'tax_reference_residential_value_per_sqm','official_reference',value,'ALL/m2','Residential buildings; tax value, not market asking or transaction price.','official_reference_only',start='2023-07-28',snapshot='2023-07-28',sample='not_applicable',row='Annex 1 a.2 administrative unit '+name,notes='Applicability may depend on building permit date and later legal rulings.')

# Keydata quarterly average index values as transcribed from the published Q2 2026 table.
for name,value,desc in KEYDATA:
    aid='keydata-unit:'+slug(name); area(aid,name,'market_index_area','tirana',name,'Keydata/Hyrja published area label',None,'label_only',desc)
    obs('keydata_q2_2026',aid,'market_apartment_price_per_sqm','mean',value,'EUR/m2','Apartments; index mixes new build and resale, mostly resale.','published_aggregate_attribution_scope_unclear',start='2026-04-01',end='2026-06-30',snapshot='2026-06-30',sample='source_does_not_publish_n',row='Hyrja published table: '+name,notes=desc)

# Keep the municipal-unit 1 boundary available for map orientation even though
# no consistent Unit 1 market figure was found in the reviewed publication.
area('keydata-unit:unit-1','Unit 1','market_index_area','tirana','Unit 1','Keydata published area label',None,'label_only','Boundary is mapped, but the reviewed Q2 2026 publication did not provide a consistent Unit 1 price value.')

# Join published unit values to the exact OSM admin-level 9 boundaries in the
# bundled GeoPackage. Boundaries remain separate from Prona neighbourhood points.
if GPKG.exists():
    from build_tirana_market_map import gpkg_geojson
    gpkg=sqlite3.connect(GPKG)
    unit_rows=gpkg.execute("SELECT name,geom,osm_id FROM gis_osm_adminareas_a_free WHERE fclass='admin_level9' AND name LIKE '%Bashkiake Nr.%'").fetchall()
    for osm_name,geom,osm_id in unit_rows:
        match=re.search(r'Nr\.\s*(\d+)',osm_name or '')
        if not match:continue
        unit_name='Unit '+match.group(1); aid='keydata-unit:'+slug(unit_name)
        if aid not in area_ids:continue
        geometry=gpkg_geojson(geom)
        db.execute('UPDATE areas SET geometry_source=?,geometry_ref=?,geometry_status=?,notes=? WHERE area_id=?',('OpenStreetMap Geofabrik Albania snapshot',str(osm_id),'verified_admin_boundary','OSM admin-level 9 polygon; joined to the published index by the numbered municipal unit.',aid))
        db.execute('INSERT INTO area_geometries(area_id,source_id,geometry_type,geojson,source_feature_id,geometry_status,notes) VALUES(?,?,?,?,?,?,?)',(aid,'osm_geofabrik',geometry['type'],json.dumps(geometry,separators=(',',':')),str(osm_id),'verified_admin_boundary','© OpenStreetMap contributors; ODbL 1.0.'))
    gpkg.close()

# Example parent-child matches are deliberately candidate-only until boundary containment is checked.
for child in ('prona-neighbourhood:astir','prona-neighbourhood:yzberisht'):
    if child in area_ids:
        db.execute('INSERT INTO area_relationship_candidates VALUES(?,?,?,?,?)',('admin-unit:kashar',child,'possible containment','needs_boundary_validation','Candidate only, based on product example; validate with authoritative polygons before enabling fallback.'))

file_sources={'prona_neighbourhoods_sale.csv':'prona_neighbourhoods','vatreja_tirana.csv':'vatreja_city','vatreja_q3_2026.csv':'vatreja_q3','domlivo_tirana.csv':'domlivo_tirana','balkanhome_q3_2026.csv':'balkanhome_q3','prona_neighbourhood_osm_points.json':'osm_nominatim'}
for filename,source in file_sources.items():
    p=RAW/filename
    if p.exists():db.execute('INSERT INTO dataset_files(source_id,relative_path,sha256,bytes,downloaded_at,snapshot_date) VALUES(?,?,?,?,?,?)',(source,str(p.relative_to(ROOT)),digest(p),p.stat().st_size,BUILT_AT,SNAPSHOT))
db.executemany('INSERT INTO metadata VALUES(?,?)',[
 ('database_name','PronaX Tirana housing price research database'),('version','0.1.0'),('built_at_utc',BUILT_AT),('csv_downloaded_on',SNAPSHOT),
 ('market_price_warning','Listing-derived values are asking prices, not completed sale prices.'),
 ('geometry_policy','A market-area label is not automatically an exact polygon. Unmatched labels must not be displayed as precise filled boundaries.'),
 ('fallback_policy','Only use child or parent observations with comparable indicator, source, period and property scope. Candidate area relationships are not active.'),
 ('currency_policy','Source currencies are preserved. Do not convert ALL to EUR without storing a dated exchange rate.'),
 ('attribution_policy','Return publisher, period, sample size, scope and required source link with every displayed value.')])
db.commit(); db.execute('PRAGMA optimize'); db.close()
print(f'Built {DB} ({DB.stat().st_size:,} bytes)')
