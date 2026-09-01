#!/usr/bin/env python3
"""Audit browser/screenshot token cost across Claude Code transcripts.

Reads only image dimensions and byte counts -- image data never enters context.

Usage:
    python3 audit_browser_cost.py                     # last 7 days, all projects
    python3 audit_browser_cost.py --since 2026-08-10
    python3 audit_browser_cost.py --project jobhunt
"""
import json, base64, struct, glob, os, sys, argparse, datetime
from collections import defaultdict

IMG_TOK_FALLBACK = 1500      # Anthropic charges ~(w*h)/750, capped ~1568px/edge


def png_dims(b64):
    try:
        raw = base64.b64decode(b64[:64] + '==')
        if raw[:8] == b'\x89PNG\r\n\x1a\n':
            return struct.unpack('>II', raw[16:24])
    except Exception:
        pass
    return None


def img_tokens(b64):
    d = png_dims(b64)
    if not d:
        return IMG_TOK_FALLBACK
    w, h = d
    if max(w, h) > 1568:
        r = 1568 / max(w, h)
        w, h = int(w * r), int(h * r)
    return (w * h) // 750


def walk(node, fn):
    if isinstance(node, dict):
        fn(node)
        for v in node.values():
            walk(v, fn)
    elif isinstance(node, list):
        for v in node:
            walk(v, fn)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--since', help='YYYY-MM-DD (default: 7 days ago)')
    ap.add_argument('--project', help='substring filter on project dir')
    ap.add_argument('--root', default=os.path.expanduser('~/.claude/projects'))
    a = ap.parse_args()

    if a.since:
        cutoff = datetime.datetime.strptime(a.since, '%Y-%m-%d').timestamp()
    else:
        cutoff = datetime.datetime.now().timestamp() - 7 * 86400

    files = [p for p in glob.glob(os.path.join(a.root, '**', '*.jsonl'), recursive=True)
             if os.path.getmtime(p) > cutoff and (not a.project or a.project in p)]
    if not files:
        sys.exit('no transcripts matched')

    proj = defaultdict(lambda: {'imgs': 0, 'tok': 0, 'files': 0})
    names, tools = {}, defaultdict(lambda: {'n': 0, 'img': 0, 'tok': 0})

    for f in files:
        p = f.split('/projects/')[1].split('/')[0]
        proj[p]['files'] += 1
        with open(f, errors='ignore') as fh:
            for line in fh:
                try:
                    obj = json.loads(line)
                except Exception:
                    continue

                def collect(d):
                    if d.get('type') == 'tool_use' and 'id' in d:
                        names[d['id']] = d.get('name', '?')
                    if d.get('type') == 'image':
                        data = (d.get('source') or {}).get('data') or ''
                        if data:
                            proj[p]['imgs'] += 1
                            proj[p]['tok'] += img_tokens(data)
                walk(obj, collect)

    for f in files:
        with open(f, errors='ignore') as fh:
            for line in fh:
                try:
                    obj = json.loads(line)
                except Exception:
                    continue

                def res(d):
                    if d.get('type') != 'tool_result':
                        return
                    t = tools[names.get(d.get('tool_use_id'), 'unknown')]
                    t['n'] += 1
                    c = d.get('content')
                    items = c if isinstance(c, list) else (
                        [{'type': 'text', 'text': c}] if isinstance(c, str) else [])
                    for it in items:
                        if not isinstance(it, dict):
                            continue
                        if it.get('type') == 'text':
                            t['tok'] += len(it.get('text') or '') // 4
                        elif it.get('type') == 'image':
                            t['img'] += 1
                            t['tok'] += img_tokens((it.get('source') or {}).get('data') or '')
                walk(obj, res)

    print(f"{'project':<40}{'files':>6}{'imgs':>8}{'img tokens':>13}")
    ti = tt = 0
    for p, s in sorted(proj.items(), key=lambda kv: -kv[1]['tok']):
        if not s['imgs']:
            continue
        ti += s['imgs']; tt += s['tok']
        print(f"{p[:39]:<40}{s['files']:>6}{s['imgs']:>8}{s['tok']:>13,}")
    print('-' * 67)
    print(f"{'TOTAL':<40}{'':>6}{ti:>8}{tt:>13,}")

    rows = [(k, v) for k, v in tools.items() if v['n'] >= 5]
    rows.sort(key=lambda kv: -kv[1]['tok'])
    print(f"\n{'tool':<44}{'calls':>7}{'imgs':>7}{'tok/call':>10}{'total':>13}")
    for k, v in rows[:18]:
        label = k.replace('mcp__claude-in-chrome__', 'chrome:')
        print(f"{label[:43]:<44}{v['n']:>7}{v['img']:>7}"
              f"{v['tok'] // max(v['n'], 1):>10,}{v['tok']:>13,}")


if __name__ == '__main__':
    main()
