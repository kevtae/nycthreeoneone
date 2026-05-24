"""
NYC 311 catalog harvester.

Crawls the public 311 portal (read-only, no API key, no captcha — submission is
the only captcha-gated step) and produces two files in ../data/:

  catalog.json    one row per fileable report option: ka, title, label, agency,
                  caid, kasid, entry_url. caid/kasid come from the
                  createServiceRequest(...) onclick in each article's served HTML.
  knowledge.json  the informational/FAQ articles (no report form): ka, title, url, body.

Re-run this as the refresh job: the caid/kasid GUIDs get regenerated when NYC
updates the portal, so deep-links can go stale.

Usage:  python3 scripts/harvest.py
"""
import re, json, time, os, html, urllib.request
from urllib.parse import urljoin
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE="https://portal.311.nyc.gov/"
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
os.makedirs(OUT, exist_ok=True)
UA={"User-Agent":"Mozilla/5.0 (nyc311-catalog-harvest; research)"}

def get(url):
    req=urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8","replace")

# ---------- 1. enumerate all KA numbers via category crawl ----------
print("enumerating categories...", flush=True)
home=get(BASE)
def cat_ids(s): return set(c.split('&')[0] for c in re.findall(r'kacategory/\?id=([0-9a-zA-Z-]+)', s))
seen=set(); queue=list(cat_ids(home)); ka=set()
while queue:
    cid=queue.pop(0)
    if cid in seen: continue
    seen.add(cid)
    try: chtml=get(BASE+"kacategory/?id="+cid)
    except Exception as e: print("  !!",cid,e,flush=True); continue
    ka|=set(re.findall(r'kanumber=(KA-\d+)', chtml))
    queue+=[c for c in cat_ids(chtml) if c not in seen]
    time.sleep(0.25)
ka=sorted(ka)
print(f"categories crawled: {len(seen)}  distinct KA: {len(ka)}", flush=True)

# ---------- 2. fetch each article: deep-links + body text + links ----------
TITLE=re.compile(r"<title>(.*?)</title>", re.S|re.I)
A_TAG=re.compile(r'<a\b[^>]*?href="([^"]*)"[^>]*>(.*?)</a>', re.S|re.I)

def article_url(k): return f"{BASE}article/?kanumber={k}"

def resolve(href, page):
    """Resolve an href to an absolute URL. javascript:createServiceRequest -> the
    deep-link; internal article paths -> canonical ?kanumber= form."""
    href=html.unescape(href.strip())
    if href.startswith("javascript:"):
        a=re.findall(r"'([^']*)'", href)
        if "createServiceRequest" in href and len(a)>5 and a[1] and a[5]:
            return f"{BASE}servicerequest-create/What?caid={a[1]}&kasid={a[5]}"
        return ""
    if not href or href.startswith("#"): return ""
    url=urljoin(page, href)
    m=re.search(r"/article/(KA-\d+)\b", url)        # canonicalize internal article links
    if m and "kanumber=" not in url: url=article_url(m.group(1))
    return url

def striptags(s):
    return html.unescape(re.sub(r"(?s)<[^>]+>","",s)).strip()

def extract(h, page):
    """Return (body_markdown, links[]) from the ka-content container, links preserved."""
    m=re.search(r'<div class="ka-content">', h)
    if not m: return "", []
    rest=h[m.end():]
    end=len(rest)
    for marker in (r'<div class="modal', r'<footer', r'class="popup-widget'):
        mm=re.search(marker, rest)
        if mm: end=min(end, mm.start())
    seg=re.sub(r"(?is)<(script|style)\b.*?</\1>"," ", rest[:end])
    links=[]
    def repl(mt):
        href=resolve(mt.group(1), page); text=striptags(mt.group(2))
        if href and text:
            links.append({"text":text,"href":href}); return f"[{text}]({href})"
        return text
    seg=A_TAG.sub(repl, seg)                          # links -> markdown, before stripping
    # preserve section structure: headings -> "## ", block boundaries -> newlines
    seg=re.sub(r"(?is)<h[1-6][^>]*>(.*?)</h[1-6]>",
               lambda mt: "\n\n## "+re.sub(r"<[^>]+>"," ",mt.group(1)).strip()+"\n", seg)
    seg=re.sub(r"(?i)<li\b[^>]*>", "\n- ", seg)
    seg=re.sub(r"(?i)<br\s*/?>", "\n", seg)
    seg=re.sub(r"(?i)</(p|li|tr|div)>", "\n", seg)
    seg=re.sub(r"(?s)<[^>]+>"," ", seg)               # strip remaining tags
    seg=html.unescape(seg)
    seg=re.sub(r"[ \t]+"," ", seg)
    seg=re.sub(r" *\n *","\n", seg)
    return re.sub(r"\n{3,}","\n\n", seg).strip(), links

def fetch(k):
    page=article_url(k)
    try: h=get(page)
    except Exception as e: return k,{"error":str(e)}
    title=striptags(TITLE.search(h).group(1)) if TITLE.search(h) else ""
    title=re.sub(r"\s*[·|‹›-]\s*NYC311\s*$","",title).strip()
    reports=[]
    for argstr,label in re.findall(r"createServiceRequest\(([^)]*)\)[^>]*>(.*?)</a>", h, re.S|re.I):
        a=re.findall(r"'([^']*)'", argstr)
        caid=a[1] if len(a)>1 else ""; agency=a[4] if len(a)>4 else ""; kasid=a[5] if len(a)>5 else ""
        if caid and kasid:
            reports.append({"label":striptags(label),"caid":caid,"kasid":kasid,"agency":agency,
                "entry_url":f"{BASE}servicerequest-create/What?caid={caid}&kasid={kasid}"})
    body,links=extract(h, page)
    return k,{"ka":k,"title":title,"url":page,"fileable":bool(reports),
              "reports":reports,"body":body,"links":links}

results={}; done=0
with ThreadPoolExecutor(max_workers=5) as ex:
    futs={ex.submit(fetch,k):k for k in ka}
    for f in as_completed(futs):
        k,d=f.result(); results[k]=d; done+=1
        if done%200==0: print(f"  {done}/{len(ka)} articles", flush=True)

errs=[k for k,d in results.items() if "error" in d]
ok=[d for d in results.values() if "error" not in d]
fileable=[d for d in ok if d["fileable"]]

# catalog.json = fileable report options (one row per option, for classify -> file)
catalog=[]
for d in fileable:
    for r in d["reports"]:
        catalog.append({"ka":d["ka"],"title":d["title"],"label":r["label"],
            "agency":r["agency"],"caid":r["caid"],"kasid":r["kasid"],"entry_url":r["entry_url"]})

# knowledge.json = ALL articles (body + preserved links), with fileable flag, for Q&A
knowledge=[{"ka":d["ka"],"title":d["title"],"url":d["url"],"fileable":d["fileable"],
            "body":d["body"],"links":d["links"]} for d in ok]

json.dump(catalog, open(f"{OUT}/catalog.json","w"), indent=2)
json.dump(knowledge, open(f"{OUT}/knowledge.json","w"), indent=2)

print("="*55, flush=True)
print(f"total articles:        {len(ka)}  (errors: {len(errs)})", flush=True)
print(f"  fileable articles:   {len(fileable)}", flush=True)
print(f"  -> report options:   {len(catalog)}  (catalog.json rows)", flush=True)
print(f"  knowledge corpus:    {len(knowledge)}  (knowledge.json rows, all articles)", flush=True)
print(f"  total links preserved: {sum(len(d['links']) for d in ok)}", flush=True)
print(f"distinct agencies in catalog: {len(set(c['agency'] for c in catalog if c['agency']))}", flush=True)
print(f"wrote {OUT}/catalog.json and {OUT}/knowledge.json", flush=True)
