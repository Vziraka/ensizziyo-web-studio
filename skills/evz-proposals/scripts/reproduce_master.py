from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, white
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
import json
import argparse

parser = argparse.ArgumentParser(description="Reproduce the approved fictional EVZ master, not a client proposal.")
parser.add_argument("--output-dir", required=True, type=Path)
args = parser.parse_args()
if not args.output_dir.is_absolute():
    parser.error("--output-dir must be an absolute path outside the skill folder")
ROOT = args.output_dir.resolve()
SKILL_ROOT = Path(__file__).resolve().parent.parent
if ROOT == SKILL_ROOT or SKILL_ROOT in ROOT.parents:
    parser.error("Choose an output directory outside the installed skill")
OUT = ROOT / "output/pdf"
if (OUT / "EVZ-Digital-Master-Proposal-Review.pdf").exists():
    parser.error("Output PDF already exists; choose a new review directory")
OUT.mkdir(parents=True, exist_ok=True)
ASSETS = SKILL_ROOT / "assets"
pdfmetrics.registerFont(TTFont("Manrope", str(ASSETS / "manrope-regular.ttf")))
pdfmetrics.registerFont(TTFont("ManropeBold", str(ASSETS / "manrope-bold.ttf")))
pdfmetrics.registerFontFamily("Manrope", normal="Manrope", bold="ManropeBold")
PDF = OUT / "EVZ-Digital-Master-Proposal-Review.pdf"
c = canvas.Canvas(str(PDF), pagesize=(612,792))
c.setTitle("EVZ Digital | Master proposal design review")
c.setAuthor("EVZ Digital")
c.setSubject("Fictional website and lead-capture proposal; design review only")
INK, MUTED, LINE, PALE = map(HexColor, ["#202020","#606060","#dadada","#f5f5f5"])
M, RIGHT, WIDTH = 48, 564, 516
checks = []

def rect(x,y,w,h,fill=PALE,stroke=None,radius=0):
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    if radius: c.roundRect(x,792-y-h,w,h,radius,fill=1,stroke=bool(stroke))
    else: c.rect(x,792-y-h,w,h,fill=1,stroke=bool(stroke))

def line(x,y,x2,color=LINE):
    c.setStrokeColor(color); c.setLineWidth(.6)
    c.line(x,792-y,x2,792-y)

def text(s,x,y,size=10,font="Manrope",color=INK):
    c.setFillColor(color); c.setFont(font,size)
    c.drawString(x,792-y-size,s)

def para(s,x,y,w=WIDTH,size=10.5,leading=16,color=INK,bold=False):
    p = Paragraph(s,ParagraphStyle("p",fontName="ManropeBold" if bold else "Manrope",
        fontSize=size,leading=leading,textColor=color,spaceAfter=0))
    _,h=p.wrap(w,700)
    p.drawOn(c,x,792-y-h)
    checks.append({"page":c.getPageNumber(),"top":y,"bottom":y+h,"text":s[:70]})
    if y+h>726: raise ValueError(f"Content past footer: {s}")
    return y+h

def label(s,x,y,color=MUTED):
    text(s.upper(),x,y,8,"ManropeBold",color)

def start(section,n):
    c.bookmarkPage(f"p{n}"); c.addOutlineEntry(section,f"p{n}",level=0)
    c.drawImage(str(ASSETS/"evz-wordmark.png"),44,792-75,width=62,height=39.7,mask="auto")
    text("DIGITAL",116,52,8,"ManropeBold")
    text("ALDER & STONE / PROJECT PROPOSAL",344,52,8,color=MUTED)
    line(M,92,RIGHT)
    label(section,M,116)
    line(M,744,RIGHT)
    text("EVZ Digital  /  Fictional sample - design review only",M,758,8,color=MUTED)
    text(f"{n:02d} / 07",529,758,8,color=MUTED)

def heading(s,subtitle=None):
    bottom=para(s,M,143,size=31,leading=37)
    if subtitle: return para(subtitle,M,bottom+16,size=11,leading=17,color=MUTED)
    return bottom

def block(title,body,x,y,w=WIDTH):
    text(title,x,y,12,"ManropeBold")
    return para(body,x,y+25,w,size=10.5,leading=16,color=MUTED)

def table_row(y,title,body,height,tag=None):
    line(M,y,RIGHT)
    text(title,M,y+15,11,"ManropeBold")
    if tag: label(tag,M,y+37)
    para(body,225,y+13,339,size=10.2,leading=15)
    return y+height

# 1 / useful executive opening, no empty cover.
start("The recommendation",1)
para("A clearer path<br/>from visit to inquiry.",M,151,WIDTH,size=38,leading=44)
text("Prepared for Alder & Stone Home Services",M,267,13,"ManropeBold")
text("October 20, 2026  /  EVZ-PROP-001  /  Review edition 01",M,292,9,color=MUTED)
para("A considered website and a connected inquiry process for a fictional, "
     "owner-operated home-services business in Northern Virginia.",M,329,480,size=12,leading=19)
rect(M,405,WIDTH,110,PALE,LINE,radius=5)
for x,k,v,note in [(68,"Fixed project fee","$1,995","USD / optional items extra"),
                   (244,"Estimated delivery","3-4 weeks","After content and access"),
                   (420,"Website scope","5 pages","Plus one inquiry flow")]:
    label(k,x,425); text(v,x,445,24); text(note,x,482,8.2,color=MUTED)
block("What this project will change",
      "Make services easier to understand, give homeowners one clear way to request an "
      "estimate, and put new inquiries in one place for the owner to review.",M,551)
line(M,637,RIGHT)
label("Recommended solution",M,657)
para("Business website + lead capture",M,676,size=16,leading=22)
para("This sample uses invented discovery details and project assumptions. It is a "
     "layout review, not a live client offer.",341,655,223,size=9,leading=14,color=MUTED)
c.showPage()

# 2 / explicit page-level deliverables.
start("Website scope",2)
heading("A focused, five-page website.",
        "One coherent design direction, adapted for desktop and mobile. "
        "The client's existing logo and approved photographs remain central.")
y=259
rows=[
("Home","Introduce the business, summarize services, show supplied proof and guide visitors to request an estimate.",70),
("Services","Present up to four service categories on one page, with concise descriptions and links to the inquiry form.",70),
("About","Explain the business's approach, service area and team using approved client information.",66),
("Project gallery","Display up to 12 supplied project photographs with short captions. One gallery; no filtering or case-study pages.",77),
("Contact / estimate","One inquiry form with up to six fields, visible contact details, service-area guidance and a confirmation state.",76)]
for a,b,h in rows: y=table_row(y,a,b,h)
line(M,y,RIGHT)
para("<b>Included throughout:</b> responsive layouts, keyboard-friendly navigation, "
     "page titles and descriptions, image alternative text, light editing of up to "
     "1,500 supplied words, and launch on the agreed hosting account.",
     M,y+17,size=10,leading=15)
para("<b>Outside this scope:</b> a new logo, original photography, full copywriting, "
     "online payments, a customer portal, additional pages and ongoing SEO.",
     M,y+80,size=9.5,leading=14,color=MUTED)
c.showPage()

# 3 / a readable diagram with implementation boundaries.
start("Lead capture",3)
heading("Every inquiry has a next step.",
        "One website form connects to one existing Pipedrive account through Make. "
        "For this fictional project, the required account access and compatibility are assumed confirmed.")
for x,title,body in [
    (48,"Website inquiry","Homeowner submits\nan estimate request."),
    (226,"CRM record","Contact and inquiry\nenter one pipeline."),
    (404,"Owner notification","The owner receives\nan email to follow up.")]:
    rect(x,272,160,99,PALE,LINE,4)
    text(title,x+14,289,10.2,"ManropeBold")
    para(body.replace("\n","<br/>"),x+14,314,132,size=9.5,leading=15,color=MUTED)
for x in [211,389]:
    c.setStrokeColor(INK); c.setLineWidth(.8)
    c.line(x,792-321,x+11,792-321)
    c.line(x+7,792-317,x+11,792-321)
    c.line(x+7,792-325,x+11,792-321)
block("What is connected",
      "Map name, email, phone, service needed, ZIP code and project notes. Match contacts "
      "by email; create a new inquiry for each valid request. Add a website-source label "
      "and place the inquiry in one agreed starting stage.",M,401)
block("What happens if a connection fails",
      "Keep a recoverable form submission in the agreed form service. Configure a "
      "failure notification to the owner. Document how to retry a failed transfer "
      "without creating an extra inquiry record.",M,501)
rect(M,605,WIDTH,107,PALE)
label("Completion checks",66,621)
para("A normal submission reaches the right CRM fields; a repeat email matches the "
     "existing contact; required-field errors are clear; and a simulated CRM failure "
     "produces the agreed notification and recovery path.",66,644,480,size=10,leading=16)
c.showPage()

# 4 / timeline tied to client inputs.
start("Delivery plan",4)
heading("A clear sequence.<br/>Room for your feedback.",
        "Allow approximately 3-4 weeks from receipt of the deposit, agreed content and account access.")
y=272
for a,b,h,t in [
("Confirm & prepare","Confirm the page outline, content, CRM field map and project contacts. Client supplies assets and access.","84","WEEK 1"),
("Design & review","Present the recommended visual direction and representative layouts. Client returns one consolidated set of feedback.","89","WEEKS 1-2"),
("Build & connect","Complete the website and inquiry flow. Test on desktop and mobile; share a private staging link for the second review.","89","WEEKS 2-3"),
("Approve & launch","Resolve agreed feedback, complete the launch checklist and obtain written approval. Final payment precedes launch.","86","WEEKS 3-4")]:
    y=table_row(y,a,b,int(h),t)
line(M,y,RIGHT)
para("<b>Client inputs:</b> final logo, approved photos, service details, contact details, "
     "supplied copy, account invitations and any required policy wording.",M,y+18,size=10,leading=15)
para("The sample schedule assumes feedback within two business days at each review. "
     "Delayed content, access or decisions move the delivery date; EVZ confirms a revised schedule.",
     M,y+69,size=9.5,leading=14,color=MUTED)
c.showPage()

# 5 / one recommendation and explicit optional prices.
start("Investment",5)
heading("One recommended project.",
        "Website + lead capture. The fixed fee covers the scope on pages 2-3, "
        "two revision rounds, launch, handover and the defect-fix period.")
rect(M,255,WIDTH,107,INK,radius=5)
label("Fixed project fee / USD",68,273,white)
text("$1,995",68,294,36,color=white)
para("One project.<br/>One agreed scope.",378,290,160,size=14,leading=22,color=white)
for x,title,value,note in [
    (48,"50% TO BEGIN","$997.50","Due before work starts"),
    (318,"50% BEFORE LAUNCH","$997.50","Due after review, before publishing")]:
    label(title,x,386); text(value,x,405,24); text(note,x,440,9,color=MUTED)
label("Optional add-ons / not included in $1,995",M,487)
y=510
for name,desc,price in [
    ("Additional page","One page within the approved visual system.","$250 once"),
    ("Booking connection","One existing scheduling tool embedded and tested.","$350 once"),
    ("Website care","Monthly checks and up to 30 minutes of small edits.","$99 / month")]:
    line(M,y,RIGHT)
    text(name,M,y+12,10.5,"ManropeBold")
    text(price,465,y+12,10,"ManropeBold")
    text(desc,M,y+32,9,color=MUTED)
    y+=59
para("<b>Third-party costs:</b> domain, hosting, CRM and automation subscriptions or "
     "usage are paid directly by the client. Vendor plans and expected running costs "
     "are confirmed before a real proposal is approved. Optional prices here are illustrative.",
     M,692,WIDTH,size=8.5,leading=12)
c.showPage()

# 6 / working agreement clearly distinguishes defects and revisions.
start("How we work together",6)
heading("Clear expectations,<br/>from the start.")
block("Two revision rounds",
      "A round is one consolidated set of feedback from the client's decision-maker. "
      "Round one refines the visual direction and layouts; round two refines the completed "
      "staging site and inquiry flow within the agreed scope.",M,254)
block("Changes to the agreed scope",
      "New pages, functionality, integrations or a replacement design direction are "
      "scoped separately. EVZ explains the price and schedule impact and obtains written "
      "approval before carrying out additional work.",M,362)
block("Review and launch approval",
      "The client reviews the staging site against the agreed deliverables and submits "
      "consolidated feedback. EVZ addresses in-scope issues before requesting written "
      "launch approval and the final payment. Silence is not treated as approval.",M,470)
rect(M,584,WIDTH,126,PALE,LINE,4)
label("30 days of defect fixes",66,601)
para("For 30 calendar days after launch, EVZ fixes reproducible defects in the delivered "
     "work against the agreed scope at no additional project fee. These fixes do not use "
     "a revision round. New features, client-made changes and third-party outages or "
     "platform changes are assessed separately.",66,626,480,size=10,leading=16)
c.showPage()

# 7 / ownership, training and a restrained acceptance layout.
start("Handover & next steps",7)
heading("Ready to run.<br/>Ready to hand over.")
block("A practical handover",
      "One remote session of up to 60 minutes walks the owner through the website, "
      "new inquiries and connection recovery. A short written guide records account "
      "locations, the field map, routine tasks and how to request help.",M,254)
block("Files, accounts and ongoing responsibility",
      "After final payment, EVZ hands over the agreed project files and confirms the "
      "client's access to their accounts. Third-party assets and software remain subject "
      "to their licenses. Ongoing monitoring, editing and maintenance are optional; "
      "the client manages these unless a care service is selected.",M,360)
line(M,478,RIGHT)
label("To move forward",M,496)
para("<b>1.</b> Confirm the scope and any optional add-ons.<br/>"
     "<b>2.</b> Approve the written proposal and arrange the initial payment.<br/>"
     "<b>3.</b> Supply content and account access; confirm the kickoff date.",
     M,521,size=10.5,leading=22)
rect(M,609,WIDTH,106,PALE)
label("Acceptance area / layout demonstration only",66,625)
text("Client representative",66,652,9,color=MUTED)
text("Approval date",360,652,9,color=MUTED)
line(66,687,321); line(360,687,546)
text("Sample only - not for signature",66,695,8,color=MUTED)
c.showPage()
c.save()
(ROOT/"layout-checks.json").write_text(json.dumps(checks,indent=2),encoding="utf-8")
print(PDF)
