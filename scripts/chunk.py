"""
Chunk data/knowledge.json into retrieval units for pgvector.

Splits each article on its "## " section headings (preserved by harvest.py),
then packs lines into chunks up to MAX_CHARS, keeping the section heading with
its text. Markdown links inside a chunk are extracted into its links[].

Output: data/chunks.json — one row per chunk:
  { ka, title, section, body, links[] }

Usage:  python3 scripts/chunk.py
"""
import json, re, os, statistics

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
MAX_CHARS = 1600          # ~400 tokens; embedding input adds title+section context
MIN_CHARS = 40            # drop near-empty fragments

LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
SECTION = re.compile(r"(?m)^##\s+(.+)$")


def split_sections(body):
    """[(section_title|None, text), ...] — text before the first heading is intro."""
    pieces = SECTION.split(body)
    out = []
    intro = pieces[0].strip()
    if intro:
        out.append((None, intro))
    for i in range(1, len(pieces), 2):
        title = pieces[i].strip()
        text = pieces[i + 1].strip() if i + 1 < len(pieces) else ""
        out.append((title, text))
    return out


def pack(text, maxc):
    """Greedily pack lines into <=maxc chunks; hard-split any oversized line."""
    chunks, cur = [], ""
    for line in (l.strip() for l in re.split(r"\n+", text) if l.strip()):
        while len(line) > maxc:                      # rare: a single huge line
            if cur:
                chunks.append(cur); cur = ""
            chunks.append(line[:maxc]); line = line[maxc:]
        if cur and len(cur) + len(line) + 1 > maxc:
            chunks.append(cur); cur = line
        else:
            cur = f"{cur}\n{line}" if cur else line
    if cur:
        chunks.append(cur)
    return chunks


def chunk_article(a):
    out = []
    for section, text in split_sections(a["body"]):
        for piece in pack(text, MAX_CHARS):
            if len(piece) < MIN_CHARS:
                continue
            out.append({
                "ka": a["ka"],
                "title": a["title"],
                "section": section,
                "body": piece,
                "links": [{"text": t, "href": h} for t, h in LINK.findall(piece)],
            })
    return out


def main():
    articles = json.load(open(f"{DATA}/knowledge.json"))
    chunks = []
    for a in articles:
        chunks.extend(chunk_article(a))
    json.dump(chunks, open(f"{DATA}/chunks.json", "w"), indent=2)

    sizes = [len(c["body"]) for c in chunks]
    per_article = {}
    for c in chunks:
        per_article[c["ka"]] = per_article.get(c["ka"], 0) + 1
    print(f"articles in:        {len(articles)}")
    print(f"chunks out:         {len(chunks)}  -> data/chunks.json")
    print(f"articles w/ chunks: {len(per_article)}")
    print(f"chunk chars:        min {min(sizes)}  median {int(statistics.median(sizes))}  max {max(sizes)}")
    print(f"chunks/article:     max {max(per_article.values())}  avg {len(chunks)/max(1,len(per_article)):.1f}")
    print(f"chunks with links:  {sum(1 for c in chunks if c['links'])}")


if __name__ == "__main__":
    main()
