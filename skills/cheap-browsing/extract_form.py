#!/usr/bin/env python3
"""Turn a saved HTML page into a compact form-field manifest.

The point: raw HTML is 16k-75k tokens. This manifest is 50-400.
The HTML must stay on disk and never be read into the model's context.

Usage:
    python3 extract_form.py page.html            # manifest to stdout
    python3 extract_form.py page.html --json     # machine-readable
"""
import re, sys, json, html as htmlmod

TAG = re.compile(r'(?is)<(input|select|textarea)\b([^>]*)>')
ATTR = re.compile(r'''(?is)([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))''')
LABEL = re.compile(r'''(?is)<label\b([^>]*)>(.*?)</label>''')
OPTION = re.compile(r'''(?is)<option\b([^>]*)>(.*?)</option>''')
SKIP_TYPES = {'hidden', 'submit', 'button', 'image', 'reset'}


def attrs(s):
    return {m.group(1).lower(): htmlmod.unescape(m.group(2) or m.group(3) or m.group(4) or '')
            for m in ATTR.finditer(s or '')}


def strip(s):
    s = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', s or '')
    return re.sub(r'\s+', ' ', re.sub(r'(?s)<[^>]+>', ' ', s)).strip()


def extract(doc):
    doc = re.sub(r'(?is)<(script|style|svg|noscript)[^>]*>.*?</\1>', ' ', doc)

    labels = {}
    for m in LABEL.finditer(doc):
        a = attrs(m.group(1))
        text = strip(m.group(2))
        if a.get('for') and text:
            labels.setdefault(a['for'], text)

    # selects/textareas need their inner content, so slice them out first
    blocks = {}
    for tag in ('select', 'textarea'):
        for m in re.finditer(r'(?is)<%s\b([^>]*)>(.*?)</%s>' % (tag, tag), doc):
            a = attrs(m.group(1))
            key = a.get('name') or a.get('id')
            if key:
                blocks[(tag, key)] = m.group(2)

    seen, out = set(), []
    for m in TAG.finditer(doc):
        tag, a = m.group(1).lower(), attrs(m.group(2))
        typ = (a.get('type') or ('text' if tag == 'input' else tag)).lower()
        if typ in SKIP_TYPES:
            continue
        name = a.get('name') or a.get('id') or a.get('aria-label') or ''
        if not name:
            continue
        key = (name, typ)
        if key in seen and typ not in ('radio', 'checkbox'):
            continue
        seen.add(key)

        label = (labels.get(a.get('id', '')) or a.get('aria-label')
                 or a.get('placeholder') or a.get('title') or '')
        field = {'name': name, 'type': typ}
        if label:
            field['label'] = label[:90]
        if 'required' in a or a.get('aria-required') == 'true':
            field['required'] = True
        if a.get('value') and typ not in ('radio', 'checkbox'):
            field['value'] = a['value'][:40]

        inner = blocks.get((tag, a.get('name') or a.get('id')))
        if inner:
            opts = [strip(o.group(2))[:40] for o in OPTION.finditer(inner)]
            opts = [o for o in opts if o]
            if opts:
                field['options'] = opts[:12] + (['...+%d' % (len(opts) - 12)] if len(opts) > 12 else [])
        out.append(field)
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        sys.exit(__doc__)
    doc = open(args[0], errors='ignore').read()
    fields = extract(doc)
    if '--json' in sys.argv:
        print(json.dumps(fields, indent=1))
        return
    if not fields:
        print('no visible form fields found '
              '(likely JS-rendered — use chrome:read_page for refs instead)')
        return
    for f in fields:
        bits = [f['name'], f['type']]
        if f.get('required'):
            bits.append('REQUIRED')
        line = '  '.join(bits)
        if f.get('label'):
            line += f"   — {f['label']}"
        if f.get('options'):
            line += f"\n      options: {', '.join(f['options'])}"
        print(line)
    print(f'\n{len(fields)} fields')


if __name__ == '__main__':
    main()
