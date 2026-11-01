"""Local deterministic composition only. Authored JSON never supplies code or commands.

Proposal layout adapts the installed EVZ master: 48pt margins, Manrope, original
wordmark, restrained charcoal panels. Content comes only from the approved quote.
"""
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, PageBreak, KeepTogether, Flowable
from pypdf import PdfReader

root = Path(sys.argv[1]).resolve()
source = json.loads((root / 'authored.json').read_text(encoding='utf-8'))
context = json.loads((root / 'context.json').read_text(encoding='utf-8'))
runtime = json.loads((root / 'runtime.json').read_text(encoding='utf-8'))
pdf = root / 'output.pdf'
if pdf.exists() or (root / 'export.json').exists():
    raise ValueError('Export already exists; inspect/resume without re-authoring')
assets = Path(runtime['proposal_assets'])
resources = []


def resource(path, expected=None):
    p = Path(path)
    if not p.is_absolute() or not p.is_file() or p.is_symlink() or not 0 < p.stat().st_size <= 64_000_000:
        raise ValueError('Unsafe configured resource')
    b = p.read_bytes()
    digest = hashlib.sha256(b).hexdigest()
    if expected is not None and digest != expected:
        raise ValueError('Configured original resource changed')
    resources.append({'name': p.name, 'sha256': digest, 'bytes': len(b)})
    return str(p)


for name, filename in [('Manrope', 'manrope-regular.ttf'), ('ManropeBold', 'manrope-bold.ttf')]:
    pdfmetrics.registerFont(TTFont(name, resource(assets / filename)))
for name, entry in runtime.get('fonts', {}).items():
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,50}', name):
        raise ValueError('Invalid font name')
    pdfmetrics.registerFont(TTFont(name, resource(entry['path'], entry['sha256'])))
pdfmetrics.registerFontFamily('Manrope', normal='Manrope', bold='ManropeBold')
images = {}
Image.MAX_IMAGE_PIXELS = 40_000_000
for name, entry in runtime.get('images', {}).items():
    path = resource(entry['path'], entry['sha256'])
    with Image.open(path) as image:
        if image.format not in ['PNG', 'JPEG', 'WEBP'] or image.width*image.height > 40_000_000:
            raise ValueError('Unsupported or excessive original image')
        images[name] = ImageReader(image.copy())


def color(value):
    if not re.fullmatch(r'#[a-fA-F0-9]{6}', value):
        raise ValueError('Use an exact RGB color')
    return HexColor(value)


def number(v, low, high):
    if isinstance(v, bool) or not isinstance(v, (float, int)) or not math.isfinite(v) or not low <= v <= high:
        raise ValueError('Layout coordinates exceed page bounds')
    return v


def plain(value, maxlen=6000):
    if not isinstance(value, str) or not value.strip() or len(value) > maxlen or any(ord(c) < 32 and c not in '\n\t' for c in value):
        raise ValueError('Invalid bounded layout text')
    return value


if source['kind'] != 'client-proposal':
    pages = source.get('pages', [])
    if not 1 <= len(pages) <= 12:
        raise ValueError('Use 1-12 complete desktop design pages')
    directions = {d['id']: d for d in source.get('directions', [])}
    if source['kind'] == 'website-concepts' and set(directions) != {p.get('direction') for p in pages}:
        raise ValueError('Every direction needs an actual authored page')
    c = canvas.Canvas(str(pdf), invariant=1)
    c.setTitle(context['source']['company']['name'] + ' | Desktop website direction review')
    c.setAuthor(source['author'])
    for index, page in enumerate(pages):
        w, h = number(page['width'], 1000, 1800), number(page['height'], 1400, 3400)
        c.setPageSize((w, h))
        c.bookmarkPage(str(index)); c.addOutlineEntry(page['title'], str(index))
        c.setFillColor(color(page.get('background', '#FFFFFF'))); c.rect(0, 0, w, h, fill=1, stroke=0)
        commands = page['commands']
        if not 5 <= len(commands) <= 800:
            raise ValueError('Incomplete or excessive layout')
        for item in commands:
            op = item['op']; x = number(item['x'], 0, w); y = number(item['y'], 0, h)
            c.setFillColor(color(item.get('color', '#202020')))
            if op in ['rect', 'ellipse']:
                width, height = number(item['w'], 0, w-x), number(item['h'], 0, h-y)
                if op == 'rect': c.rect(x, h-y-height, width, height, fill=1, stroke=0)
                else: c.ellipse(x, h-y-height, x+width, h-y, fill=1, stroke=0)
            elif op == 'line':
                x2, y2 = number(item['x2'], 0, w), number(item['y2'], 0, h)
                c.setStrokeColor(color(item.get('color', '#202020'))); c.setLineWidth(number(item.get('weight', 1), .2, 12)); c.line(x, h-y, x2, h-y2)
            elif op == 'image':
                width, height = number(item['w'], 1, w-x), number(item['h'], 1, h-y)
                image = images[item['image_id']]
                iw, ih = image.getSize()
                ratio = min(width/iw, height/ih)
                c.drawImage(image, x+(width-iw*ratio)/2, h-y-height+(height-ih*ratio)/2, width=iw*ratio, height=ih*ratio, mask='auto')
            elif op in ['text', 'paragraph']:
                font = item.get('font', 'Manrope'); size = number(item.get('size', 24), 8, 220)
                if font not in pdfmetrics.getRegisteredFontNames(): raise ValueError('Unconfigured font')
                content = plain(item['text'])
                if op == 'text':
                    if '\n' in content or pdfmetrics.stringWidth(content, font, size) > w-x or y+size > h:
                        raise ValueError('Text exceeds its page: ' + content[:70])
                    c.setFont(font, size); c.drawString(x, h-y-size, content)
                else:
                    width = number(item['w'], 10, w-x)
                    leading = number(item.get('leading', size*1.35), size, size*2)
                    p = Paragraph(escape(content).replace('\n', '<br/>'), ParagraphStyle('design', fontName=font, fontSize=size, leading=leading, textColor=color(item.get('color', '#202020'))))
                    _, height = p.wrap(width, h)
                    if y+height > h: raise ValueError('Paragraph exceeds page')
                    p.drawOn(c, x, h-y-height)
            else:
                raise ValueError('Unsupported layout command; source cannot execute code')
        c.showPage()
    c.save()
else:
    q = context['source']['approved_quote']
    if not q or source['quote_sha256'] != context['source']['quote_sha256'] or q['approved_by'] not in ['owner', 'friend']:
        raise ValueError('Exact scope/price approval missing')
    name = context['source']['company']['name']
    logo = resource(assets / 'evz-wordmark.png')
    resource(assets / 'EVZ-Digital-Master-Proposal-Review.pdf')
    body = ParagraphStyle('body', fontName='Manrope', fontSize=10.5, leading=16, textColor=color('#202020'), spaceAfter=12)
    heading = ParagraphStyle('heading', parent=body, fontName='ManropeBold', fontSize=30, leading=36, spaceAfter=22)
    sub = ParagraphStyle('sub', parent=body, fontName='ManropeBold', fontSize=13, leading=19, spaceBefore=14)
    story = []
    def para(value, style=body): return Paragraph(escape(plain(value)).replace('\n', '<br/>'), style)
    class Investment(Flowable):
        def __init__(self):
            super().__init__()
            self.width, self.height = 516, 94
        def draw(self):
            c = self.canv
            c.setFillColor(color('#202020')); c.rect(0, 0, 516, 94, fill=1, stroke=0)
            c.setFillColor(color('#FFFFFF')); c.setFont('ManropeBold',9); c.drawString(20,70,'FIXED PROJECT INVESTMENT / USD')
            c.setFont('ManropeBold',30); c.drawString(20,26,dollars(q['price_cents']))
    class ProposalDoc(SimpleDocTemplate):
        def afterFlowable(self, flowable):
            if isinstance(flowable, Paragraph) and flowable.style.name == 'heading':
                key = 'section-'+str(self.page)
                self.canv.bookmarkPage(key); self.canv.addOutlineEntry(flowable.getPlainText(),key)
    def section(title, rows):
        story.append(para(title, heading))
        if title == 'Investment': story.append(Investment())
        for label, value in rows: story.append(KeepTogether([para(label, sub), para(value)]))
    dollars = lambda cents: '${:,.2f}'.format(cents/100)
    final = q['price_cents']-q['initial_payment_cents']
    section('A defined project.\nA clear next step.', [('Prepared for', name), ('Approved project scope', q['scope']), ('Fixed investment', dollars(q['price_cents'])+' USD. Optional services are excluded unless explicitly included in the approved deliverables.'), ('Delivery window', q['timeline']), ('Review status', 'Fictional controlled proof - no real commercial commitment.' if context['source']['company'].get('origin', {}).get('fictional') or name.startswith('STUDIO TEST') else 'For client review. Internal scope and price approval does not establish client acceptance.')])
    story.append(PageBreak()); section('What is included', [('Deliverables', q['deliverables']), ('Exclusions', q['exclusions']), ('Client inputs and responsibilities', q.get('client_inputs', 'Confirm the materials and account access required by the approved deliverables before work starts.'))])
    story.append(PageBreak()); section('Delivery and completion', [('Timeline and dependencies', q['timeline']), ('Completion checks', q['acceptance']), ('Ownership and handover', q['ownership'])])
    story.append(PageBreak()); section('Investment', [('Fixed project total', dollars(q['price_cents'])+' USD'), ('Initial payment', dollars(q['initial_payment_cents'])+' USD'), ('Final payment', dollars(final)+' USD before launch or agreed final handover.'), ('Optional and third-party costs', q.get('third_party_costs', 'No optional add-ons or recurring care are included unless listed in the approved deliverables. Client-paid third-party costs require confirmation before purchase.'))])
    story.append(PageBreak()); section('Review, handover and support', [('Project revisions', str(q['revision_rounds'])+' consolidated project revision rounds. Unpaid concept refinement is tracked separately.'), ('Changes', q['change_terms']), ('Defect fixes and ongoing support', q['support_terms']), ('Cancellation terms', q['cancellation_terms']), ('Next step', 'Review this exact proposal with EVZ Digital. Written client acceptance, invoicing, payment and launch approval remain separate steps.')])
    def frame(c, doc):
        c.setTitle(name+' | EVZ Digital proposal'); c.setAuthor('EVZ Digital')
        c.drawImage(logo,44,717,width=62,height=39.7,mask='auto')
        c.setFont('ManropeBold',8); c.drawString(116,732,'DIGITAL')
        c.setFont('Manrope',8); c.drawRightString(564,732,'PROJECT PROPOSAL / '+context['project_id'])
        c.setStrokeColor(color('#dadada')); c.setLineWidth(.6); c.line(48,700,564,700); c.line(48,48,564,48)
        c.setFillColor(color('#606060')); c.setFont('Manrope',8); c.drawString(48,28,'EVZ Digital / '+q['approved_at'][:10]+' / Review '+root.name[-12:]); c.drawRightString(564,28,str(doc.page))
    ProposalDoc(str(pdf),pagesize=(612,792),rightMargin=48,leftMargin=48,topMargin=120,bottomMargin=75,invariant=1).build(story,onFirstPage=frame,onLaterPages=frame)

reader = PdfReader(pdf)
if reader.is_encrypted or not 1 <= len(reader.pages) <= 16 or any(not p.extract_text().strip() for p in reader.pages):
    raise ValueError('Export has unreadable or missing pages')
subprocess.run([runtime['pdftoppm'], '-scale-to', '1800', '-png', str(pdf), str(root/'page')], check=True, timeout=90, capture_output=True)
page_files = sorted(root.glob('page-*.png'), key=lambda p: int(p.stem.split('-')[-1]))
if len(page_files) != len(reader.pages): raise ValueError('Incomplete page rendering')
result = {'schema_version':1,'context_sha256':source['context_sha256'],'source_sha256':sys.argv[2], 'pdf':{'name':'output.pdf','bytes':pdf.stat().st_size,'sha256':hashlib.sha256(pdf.read_bytes()).hexdigest()},'pages':[{'page':i+1,'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for i,p in enumerate(page_files)],'resources':resources,'validation':{'searchable_pages':len(reader.pages),'renderer':'ReportLab','rasterizer':'Poppler','visual_review':'Required separately; not inferred from geometry or page count'}}
temp = root/'export.pending.json'
temp.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
temp.replace(root/'export.json')
