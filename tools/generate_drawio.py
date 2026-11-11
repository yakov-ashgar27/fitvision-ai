from xml.sax.saxutils import escape
import uuid

def q(s):
    return escape(str(s), {'"': '&quot;', '\n': '&#10;'})

class D:
    def __init__(s, name, pw=1600, ph=1200):
        s.name, s.cells, s.n, s.pw, s.ph = name, [], 1, pw, ph
    def id(s):
        s.n += 1
        return f"n{s.n}"
    def v(s, val, x, y, w, h, style, parent="1"):
        i = s.id()
        s.cells.append(f'<mxCell id="{i}" value="{q(val)}" style="{q(style)}" vertex="1" parent="{parent}"><mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
        return i
    def _pts(s, pts):
        if not pts:
            return ""
        return '<Array as="points">' + "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in pts) + '</Array>'
    def e(s, a, b, val="", style="endArrow=classic;html=1;", pts=None):
        i = s.id()
        s.cells.append(f'<mxCell id="{i}" value="{q(val)}" style="{q(style)}" edge="1" parent="1" source="{a}" target="{b}"><mxGeometry relative="1" as="geometry">{s._pts(pts)}</mxGeometry></mxCell>')
        return i
    def ln(s, x1, y1, x2, y2, style="endArrow=none;html=1;", pts=None, val=""):
        i = s.id()
        s.cells.append(f'<mxCell id="{i}" value="{q(val)}" style="{q(style)}" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="{x1}" y="{y1}" as="sourcePoint"/><mxPoint x="{x2}" y="{y2}" as="targetPoint"/>{s._pts(pts)}</mxGeometry></mxCell>')
    def xml(s):
        return (f'<diagram name="{q(s.name)}" id="{uuid.uuid4().hex[:20]}"><mxGraphModel dx="1422" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{s.pw}" pageHeight="{s.ph}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
                + "".join(s.cells) + '</root></mxGraphModel></diagram>')

def save(fn, ds):
    with open(fn, "w", encoding="utf-8") as f:
        f.write('<mxfile host="app.diagrams.net" version="24.7.0">' + "".join(d.xml() for d in ds) + '</mxfile>')

def note(d, text, x, y, w, h):
    d.v(text, x, y, w, h, "shape=note;whiteSpace=wrap;html=1;size=14;fillColor=#fff9c4;strokeColor=#d6b656;align=right;verticalAlign=top;spacing=10;fontSize=12;")

# =====================================================================
# 1. USE CASE
# =====================================================================
uc = D("Use Case Diagram", 1600, 1350)
ACT = "shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;fontStyle=1;fontSize=14;"
UC = "ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=13;"
UCS = "ellipse;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=13;"   # system / included
UCX = "ellipse;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=13;"   # extension
ASSOC = "endArrow=none;html=1;strokeColor=#333333;"
INC = "endArrow=open;dashed=1;html=1;endFill=0;fontSize=11;labelBackgroundColor=#ffffff;strokeColor=#9673a6;fontColor=#6a3d9a;"
EXT = "endArrow=open;dashed=1;html=1;endFill=0;fontSize=11;labelBackgroundColor=#ffffff;strokeColor=#b58900;fontColor=#8a6d00;"
GEN = "endArrow=block;endFill=0;html=1;endSize=14;strokeColor=#333333;"

uc.v("<b>FitVision AI</b> – גבולות המערכת", 200, 40, 1140, 1240,
     "rounded=0;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#475569;verticalAlign=top;fontSize=18;strokeWidth=2;")
user = uc.v("משתמש רשום", 80, 100, 30, 60, ACT)
trainee = uc.v("מתאמן<br>(Trainee)", 80, 560, 30, 60, ACT)
trainer = uc.v("מאמן כושר<br>(Trainer)", 1420, 500, 30, 60, ACT)
admin = uc.v("מנהל מערכת<br>(Admin)", 1420, 1060, 30, 60, ACT)

W, H = 210, 64
login = uc.v("התחברות למערכת", 250, 80, W, H, UC)
reset = uc.v("איפוס סיסמה", 540, 80, W, H, UCX)
profile = uc.v("ניהול פרופיל אישי", 250, 170, W, H, UC)
logout = uc.v("התנתקות", 540, 170, W, H, UC)

register = uc.v("הרשמה למערכת", 250, 290, W, H, UC)
metrics = uc.v("עדכון מדדים גופניים ויעדים", 250, 380, W, H, UC)
request = uc.v("שליחת בקשת שיוך למאמן", 250, 470, W, H, UC)
workout = uc.v("<b>ביצוע אימון מונחה מצלמה</b>", 250, 600, W, 74, UC + "strokeWidth=2;")
history = uc.v("צפייה בהיסטוריית אימונים", 250, 730, W, H, UC)

pose = uc.v("זיהוי שלד וניתוח טכניקה", 560, 470, W, H, UCS)
count = uc.v("ספירת חזרות אוטומטית", 560, 560, W, H, UCS)
feedback = uc.v("הצגת משוב בזמן אמת", 560, 650, W, H, UCS)
logdata = uc.v("שמירת נתוני האימון (לוגים)", 560, 740, W, H, UCS)
autorep = uc.v("הפקת דוח סיכום אוטומטי", 560, 840, W, H, UCS)

viewrep = uc.v("<b>צפייה בדוח אימון</b>", 820, 840, W, 70, UC + "strokeWidth=2;")
approve = uc.v("אישור / דחיית בקשת שיוך", 1100, 290, W, H, UC)
dash = uc.v("צפייה בדשבורד מתאמנים", 1100, 380, W, H, UC)
plan = uc.v("הגדרת תוכנית אימון ויעדים", 1100, 470, W, H, UC)
trend = uc.v("צפייה במגמות התקדמות", 1100, 560, W, H, UC)
addnote = uc.v("הוספת הערות מאמן לדוח", 1100, 720, W, H, UCX)
export = uc.v("ייצוא דוח (PDF / Excel)", 1100, 810, W, H, UCX)
send = uc.v("שליחת הדוח למתאמן", 1100, 900, W, H, UCX)

users_m = uc.v("ניהול משתמשים והרשאות", 1100, 1020, W, H, UC)
ex_m = uc.v("ניהול מאגר תרגילים וכללי טכניקה", 1100, 1105, W, H, UC)
mon = uc.v("ניטור מערכת ויומן פעולות", 820, 1105, W, H, UC)

# associations
for t in (login, profile, logout):
    uc.e(user, t, style=ASSOC)
for t in (register, metrics, request, workout, history):
    uc.e(trainee, t, style=ASSOC)
uc.e(trainee, viewrep, style=ASSOC, pts=[(95, 875)])
for t in (approve, dash, plan, trend):
    uc.e(trainer, t, style=ASSOC)
uc.e(trainer, viewrep, style=ASSOC)
for t in (users_m, ex_m):
    uc.e(admin, t, style=ASSOC)
uc.e(admin, mon, style=ASSOC, pts=[(1435, 1250), (925, 1250)])

# generalization
uc.e(trainee, user, style=GEN)
uc.e(trainer, user, style=GEN + "exitX=0.5;exitY=0;", pts=[(1435, 15), (95, 15)])
uc.e(admin, user, style=GEN + "exitX=1;exitY=0.5;", pts=[(1500, 1090), (1500, 15), (95, 15)])

# include / extend
for t in (pose, count, feedback, logdata, autorep):
    uc.e(workout, t, "«include»", INC)
uc.e(reset, login, "«extend»", EXT)
uc.e(autorep, viewrep, "מזין", "endArrow=open;dashed=1;html=1;fontSize=11;labelBackgroundColor=#ffffff;strokeColor=#999999;")
for t in (addnote, export, send):
    uc.e(t, viewrep, "«extend»", EXT)
uc.e(request, approve, "מזין", "endArrow=open;dashed=1;html=1;fontSize=11;labelBackgroundColor=#ffffff;strokeColor=#999999;", pts=[(355, 270), (1205, 270)])

# legend
uc.v("<b>מקרא</b><br>🔵 Use Case ראשי<br>🟣 Use Case מערכתי (נכלל – «include»)<br>🟡 Use Case מרחיב (אופציונלי – «extend»)<br>▷ הכללה (Generalization): כל השחקנים יורשים את פעולות ה\"משתמש הרשום\"",
     1360, 1180, 230, 140, "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#999999;align=right;verticalAlign=top;spacing=8;fontSize=11;")

save("FitVision_UseCase.drawio", [uc])

# =====================================================================
# 2. DFD
# =====================================================================
EXTS = "rounded=0;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontStyle=1;fontSize=14;shadow=1;"
PROC = "rounded=1;arcSize=12;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=13;shadow=1;"
STORE = "shape=partialRectangle;whiteSpace=wrap;html=1;right=0;fillColor=#d5e8d4;strokeColor=#82b366;align=left;spacingLeft=10;fontSize=13;strokeWidth=2;"
FLOW = "endArrow=classic;html=1;labelBackgroundColor=#ffffff;fontSize=11;strokeColor=#333333;"

def proc(d, num, name, x, y, w=210, h=90):
    return d.v(f"<b>{num}</b><hr style='margin:4px 0'>{name}", x, y, w, h, PROC)
def store(d, num, name, x, y, w=240):
    return d.v(f"<b>{num}</b>&nbsp;&nbsp;│&nbsp;&nbsp;{name}", x, y, w, 40, STORE)

# --- Level 0 (context)
c = D("DFD רמה 0 – דיאגרמת הקשר", 1300, 800)
c.v("<b>DFD רמה 0 – דיאגרמת הקשר (Context Diagram)</b>", 300, 0, 640, 30, "text;html=1;fontSize=18;align=center;")
P0 = c.v("<b>0</b><hr>מערכת FitVision AI", 520, 320, 260, 160, PROC + "fontSize=16;")
tr = c.v("מתאמן", 60, 320, 170, 160, EXTS)
co = c.v("מאמן כושר", 1070, 320, 170, 160, EXTS)
ad = c.v("מנהל מערכת", 565, 60, 170, 90, EXTS)
c.e(tr, P0, "פרטי הרשמה, פרופיל ויעדים", FLOW + "exitX=1;exitY=0.15;entryX=0;entryY=0.15;")
c.e(tr, P0, "זרם וידאו ממצלמה (בזמן אמת)", FLOW + "exitX=1;exitY=0.38;entryX=0;entryY=0.38;")
c.e(P0, tr, "משוב טכניקה בזמן אמת", FLOW + "exitX=0;exitY=0.62;entryX=1;entryY=0.62;")
c.e(P0, tr, "היסטוריה וסיכומי אימון", FLOW + "exitX=0;exitY=0.85;entryX=1;entryY=0.85;")
c.e(co, P0, "אישור שיוך, תוכניות ויעדים", FLOW + "exitX=0;exitY=0.15;entryX=1;entryY=0.15;")
c.e(co, P0, "הערות מאמן ובקשות ייצוא", FLOW + "exitX=0;exitY=0.38;entryX=1;entryY=0.38;")
c.e(P0, co, "דשבורד מתאמנים והתראות", FLOW + "exitX=1;exitY=0.62;entryX=0;entryY=0.62;")
c.e(P0, co, "דוח סיכום (PDF / Excel)", FLOW + "exitX=1;exitY=0.85;entryX=0;entryY=0.85;")
c.e(ad, P0, "משתמשים, תרגילים וכללי טכניקה", FLOW + "exitX=0.3;exitY=1;entryX=0.3;entryY=0;")
c.e(P0, ad, "יומן פעולות ומצב מערכת", FLOW + "exitX=0.7;exitY=0;entryX=0.7;entryY=1;")
note(c, "הערה: הווידאו הגולמי מעובד בזמן אמת ואינו נשמר במערכת – נשמרים רק נתונים מספריים (זוויות, חזרות, שגיאות). החלטה זו מצמצמת סיכוני פרטיות ונפח אחסון.", 300, 560, 700, 70)

# --- Level 1
L = D("DFD רמה 1", 1900, 1250)
L.v("<b>DFD רמה 1 – פירוק תהליכי המערכת</b>", 600, -40, 700, 30, "text;html=1;fontSize=18;align=center;")
admin_e = L.v("מנהל מערכת", 640, 0, 160, 60, EXTS)
trainee_e = L.v("מתאמן", 20, 520, 140, 80, EXTS)
trainer_t = L.v("מאמן כושר", 1640, 140, 160, 80, EXTS)
trainer_b = L.v("מאמן כושר *", 1680, 1040, 160, 80, EXTS)
trainee_b = L.v("מתאמן *", 20, 1050, 140, 70, EXTS)

P1 = proc(L, "1.0", "ניהול משתמשים, הרשאות ושיוכים", 280, 140)
P2 = proc(L, "2.0", "ניהול תרגילים ותוכניות אימון", 960, 140)
P3 = proc(L, "3.0", "קליטת וידאו וזיהוי שלד (Pose Estimation)", 300, 500)
P4 = proc(L, "4.0", "ניתוח טכניקה, ספירת חזרות ויצירת משוב", 660, 500)
P5 = proc(L, "5.0", "רישום אימון ולוגים", 1020, 500)
P6 = proc(L, "6.0", "הפקת דוח סיכום אנליטי", 1000, 860)
P7 = proc(L, "7.0", "ייצוא, הערות והפצת דוחות", 1380, 1040)

D1 = store(L, "D1", "משתמשים ופרופילים", 270, 320, 220)
D2 = store(L, "D2", "תרגילים וכללי טכניקה", 720, 320, 220)
D3 = store(L, "D3", "תוכניות אימון ויעדים", 1060, 320, 220)
D4 = store(L, "D4", "אימונים, סטים וחזרות", 860, 700, 220)
D5 = store(L, "D5", "אירועי שגיאת טכניקה", 1160, 700, 220)
D6 = store(L, "D6", "דוחות והערות", 1360, 880, 220)

L.e(trainee_e, P1, "פרטי הרשמה, פרופיל ויעדים", FLOW)
L.e(admin_e, P1, "ניהול משתמשים והרשאות", FLOW)
L.e(admin_e, P2, "תרגילים וספי זוויות", FLOW)
L.e(trainer_t, P1, "אישור שיוך מתאמן", FLOW + "exitX=0.5;exitY=0;entryX=0.5;entryY=0;", pts=[(1720, 105), (385, 105)])
L.e(trainer_t, P2, "תוכנית אימון ויעדים", FLOW)
L.e(P1, D1, "רשומת משתמש ושיוך", FLOW)
L.e(P2, D2, "כללי טכניקה", FLOW)
L.e(P2, D3, "תוכנית אימון", FLOW)
L.e(trainee_e, P3, "זרם וידאו ממצלמה", FLOW)
L.e(P3, P4, "נקודות ציון שלד<br>(33 Landmarks)", FLOW)
L.e(D2, P4, "ספי זוויות לתרגיל", FLOW)
L.e(P4, trainee_e, "משוב בזמן אמת<br>(קולי / חזותי)", FLOW + "exitX=0.5;exitY=1;entryX=0.5;entryY=1;", pts=[(765, 650), (90, 650)])
L.e(P4, P5, "חזרות, זוויות ושגיאות", FLOW)
L.e(D3, P5, "תרגילים מתוכננים", FLOW)
L.e(D1, P5, "מזהה מתאמן", FLOW + "exitX=1;exitY=1;")
L.e(P5, D4, "סשן, סטים וחזרות", FLOW)
L.e(P5, D5, "אירועי שגיאה", FLOW)
L.e(D4, P6, "נתוני אימון נוכחי + היסטוריה", FLOW)
L.e(D5, P6, "שגיאות מצטברות", FLOW)
L.e(D1, P6, "פרופיל ויעדי מתאמן", FLOW + "exitX=0;exitY=0.5;entryX=0.5;entryY=0;", pts=[(240, 340), (240, 790), (1105, 790)])
L.e(P6, D6, "דוח סיכום", FLOW)
L.e(D6, P7, "דוח שמור", FLOW)
L.e(trainer_b, P7, "הערות מאמן ובקשת ייצוא", FLOW + "exitX=0;exitY=0.25;entryX=1;entryY=0.25;")
L.e(P7, trainer_b, "דוח PDF / Excel", FLOW + "exitX=1;exitY=0.75;entryX=0;entryY=0.75;")
L.e(P7, trainee_b, "סיכום אימון רשמי", FLOW)
L.e(P7, D6, "הערות מאמן", FLOW + "exitX=0.8;exitY=0;entryX=0.8;entryY=1;")
note(L, "* ישות חיצונית כפולה – מופיעה פעמיים לשיפור הקריאות בלבד.<br>סימון: Gane &amp; Sarson. מלבן מעוגל = תהליך, מלבן פתוח = מאגר נתונים, מלבן צהוב = ישות חיצונית.", 20, 1150, 560, 70)

save("FitVision_DFD.drawio", [c, L])

# =====================================================================
# 3. ERD
# =====================================================================
er = D("ERD", 2200, 1100)
COLORS = {
    "user": ("#dae8fc", "#6c8ebf"), "plan": ("#d5e8d4", "#82b366"),
    "sess": ("#ffe6cc", "#d79b00"), "rep": ("#e1d5e7", "#9673a6"), "sys": ("#f5f5f5", "#666666"),
}
def entity(name, x, y, fields, grp, w=280):
    fill, stroke = COLORS[grp]
    h = 26 * (len(fields) + 1)
    p = er.v(name, x, y, w, h, f"swimlane;fontStyle=1;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;html=1;fillColor={fill};strokeColor={stroke};swimlaneFillColor=#ffffff;fontSize=14;")
    for i, f in enumerate(fields):
        st = "text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=8;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;html=1;fontSize=12;"
        if f.startswith("PK"):
            st += "fontStyle=5;"
        elif f.startswith("FK"):
            st += "fontStyle=2;fontColor=#1d4ed8;"
        er.v(f, 0, 26 * (i + 1), w, 26, st, parent=p)
    return p

Users = entity("Users", 40, 40, ["PK  user_id : INT", "email : VARCHAR(120) UNIQUE", "password_hash : VARCHAR(255)", "first_name : VARCHAR(50)", "last_name : VARCHAR(50)", "phone : VARCHAR(20)", "role : ENUM(Trainee, Trainer, Admin)", "is_active : BIT", "created_at : DATETIME", "last_login : DATETIME", "consent_at : DATETIME NULL"], "user")
Audit = entity("AuditLog", 40, 450, ["PK  log_id : BIGINT", "FK  user_id : INT", "action : VARCHAR(50)", "entity_name : VARCHAR(50)", "entity_id : INT", "ip_address : VARCHAR(45)", "created_at : DATETIME"], "sys")
Deliv = entity("ReportDeliveries", 40, 700, ["PK  delivery_id : INT", "FK  report_id : INT", "FK  recipient_id : INT", "channel : ENUM(Email, InApp)", "file_format : ENUM(PDF, XLSX, JSON)", "sent_at : DATETIME", "opened_at : DATETIME NULL"], "rep")

TraineeP = entity("TraineeProfiles", 400, 40, ["PK,FK  user_id : INT", "birth_date : DATE", "gender : CHAR(1)", "height_cm : DECIMAL(5,1)", "weight_kg : DECIMAL(5,1)", "fitness_level : ENUM(Beginner..Advanced)", "injuries_notes : TEXT"], "user")
Goals = entity("Goals", 400, 320, ["PK  goal_id : INT", "FK  trainee_id : INT", "FK  set_by_id : INT", "goal_type : VARCHAR(50)", "target_value : DECIMAL(8,2)", "target_date : DATE", "status : ENUM(Active, Achieved, Dropped)"], "plan")
TrainerP = entity("TrainerProfiles", 400, 560, ["PK,FK  user_id : INT", "certification : VARCHAR(100)", "specialization : VARCHAR(100)", "bio : TEXT", "invite_code : CHAR(8) UNIQUE"], "user")

Assign = entity("TrainerTraineeAssignments", 760, 40, ["PK  assignment_id : INT", "FK  trainer_id : INT", "FK  trainee_id : INT", "status : ENUM(Pending, Active, Ended)", "start_date : DATE", "end_date : DATE NULL"], "user")
Plans = entity("WorkoutPlans", 760, 280, ["PK  plan_id : INT", "FK  trainer_id : INT", "FK  trainee_id : INT", "name : VARCHAR(80)", "start_date : DATE", "end_date : DATE NULL", "notes : TEXT"], "plan")
Notes = entity("TrainerNotes", 760, 560, ["PK  note_id : INT", "FK  report_id : INT", "FK  trainer_id : INT", "note_text : TEXT", "created_at : DATETIME"], "rep")

Sess = entity("WorkoutSessions", 1120, 40, ["PK  session_id : INT", "FK  trainee_id : INT", "FK  plan_id : INT NULL", "started_at : DATETIME", "ended_at : DATETIME", "status : ENUM(InProgress, Done, Aborted)", "device_info : VARCHAR(120)", "avg_technique_score : DECIMAL(5,2)"], "sess")
PlanEx = entity("PlanExercises", 1120, 330, ["PK  plan_exercise_id : INT", "FK  plan_id : INT", "FK  exercise_id : INT", "order_index : TINYINT", "target_sets : TINYINT", "target_reps : TINYINT", "rest_seconds : SMALLINT"], "plan")
Reports = entity("Reports", 1120, 580, ["PK  report_id : INT", "FK  session_id : INT UNIQUE", "generated_at : DATETIME", "total_reps : SMALLINT", "valid_reps : SMALLINT", "avg_score : DECIMAL(5,2)", "improvement_pct : DECIMAL(5,2)", "summary_json : NVARCHAR(MAX)", "file_path : VARCHAR(255)", "status : ENUM(Draft, Reviewed, Sent)"], "rep")

Sets = entity("ExerciseSets", 1480, 40, ["PK  set_id : INT", "FK  session_id : INT", "FK  exercise_id : INT", "set_number : TINYINT", "started_at : DATETIME", "ended_at : DATETIME", "total_reps : TINYINT", "valid_reps : TINYINT", "technique_score : DECIMAL(5,2)", "avg_rom_deg : DECIMAL(5,1)"], "sess")
Ex = entity("Exercises", 1480, 380, ["PK  exercise_id : INT", "FK  created_by : INT", "name : VARCHAR(60)", "description : TEXT", "muscle_group : VARCHAR(40)", "camera_view : ENUM(Front, Side)", "demo_video_url : VARCHAR(255)", "is_active : BIT"], "plan")

Reps = entity("Repetitions", 1840, 40, ["PK  rep_id : BIGINT", "FK  set_id : INT", "rep_number : TINYINT", "duration_ms : INT", "min_angle_deg : DECIMAL(5,1)", "max_angle_deg : DECIMAL(5,1)", "is_valid : BIT", "score : DECIMAL(5,2)"], "sess")
Errs = entity("FormErrorEvents", 1840, 300, ["PK  event_id : BIGINT", "FK  set_id : INT", "FK  rep_id : BIGINT NULL", "FK  rule_id : INT", "occurred_at : DATETIME(3)", "measured_value : DECIMAL(6,2)", "feedback_text : NVARCHAR(200)"], "sess")
Rules = entity("TechniqueRules", 1840, 560, ["PK  rule_id : INT", "FK  exercise_id : INT", "rule_name : VARCHAR(80)", "joint : VARCHAR(30)", "landmark_a : TINYINT", "landmark_b (vertex) : TINYINT", "landmark_c : TINYINT", "phase : ENUM(Down, Bottom, Up)", "min_angle : DECIMAL(5,1)", "max_angle : DECIMAL(5,1)", "severity : ENUM(Low, Med, High)", "error_message : NVARCHAR(200)"], "plan")

def rel(a, b, s="ERmandOne", t="ERzeroToMany"):
    er.e(a, b, style=f"edgeStyle=entityRelationEdgeStyle;html=1;startArrow={s};endArrow={t};startFill=0;endFill=0;startSize=12;endSize=12;strokeColor=#475569;")

rel(Users, TraineeP, "ERmandOne", "ERzeroToOne")
rel(Users, TrainerP, "ERmandOne", "ERzeroToOne")
rel(Users, Audit)
rel(Users, Deliv)
rel(Users, Ex)
rel(TraineeP, Assign)
rel(TrainerP, Assign)
rel(TraineeP, Goals)
rel(TraineeP, Plans)
rel(TrainerP, Plans)
rel(TrainerP, Notes)
rel(TraineeP, Sess)
rel(Plans, PlanEx, "ERmandOne", "ERoneToMany")
rel(Ex, PlanEx)
rel(Plans, Sess, "ERzeroToOne", "ERzeroToMany")
rel(Sess, Sets, "ERmandOne", "ERoneToMany")
rel(Ex, Sets)
rel(Sets, Reps)
rel(Sets, Errs)
rel(Reps, Errs, "ERzeroToOne", "ERzeroToMany")
rel(Ex, Rules, "ERmandOne", "ERoneToMany")
rel(Rules, Errs)
rel(Sess, Reports, "ERmandOne", "ERzeroToOne")
rel(Reports, Notes)
rel(Reports, Deliv)

er.v("<b>מקרא</b><br>🔵 משתמשים והרשאות &nbsp; 🟢 תרגילים ותוכניות &nbsp; 🟠 נתוני אימון (לוגים) &nbsp; 🟣 דוחות &nbsp; ⚪ מערכת<br><u><b>קו תחתון מודגש</b></u> = מפתח ראשי (PK) &nbsp;·&nbsp; <i>נטוי כחול</i> = מפתח זר (FK)<br>סימון Crow's Foot: ‖ = בדיוק אחד, o‖ = אפס או אחד, o&lt; = אפס או יותר, ‖&lt; = אחד או יותר<br>הכללה: Users ← TraineeProfiles / TrainerProfiles (תת-טיפוסים לפי role)",
     400, 760, 700, 120, "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#999999;align=right;verticalAlign=top;spacing=10;fontSize=12;")

save("FitVision_ERD.drawio", [er])

# =====================================================================
# 4. WIREFRAMES
# =====================================================================
def rect(d, x, y, w, h, fill="#ffffff", stroke="#cbd5e1", val="", extra=""):
    return d.v(val, x, y, w, h, f"rounded=0;whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};{extra}")
def card(d, x, y, w, h):
    return d.v("", x, y, w, h, "rounded=1;arcSize=6;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#e2e8f0;shadow=1;")
def txt(d, val, x, y, w, h, size=13, color="#334155", align="right", bold=False, extra=""):
    return d.v(val, x, y, w, h, f"text;html=1;whiteSpace=wrap;fontSize={size};fontColor={color};align={align};verticalAlign=middle;" + ("fontStyle=1;" if bold else "") + extra)
def btn(d, val, x, y, w, h, fill, color="#ffffff"):
    return d.v(val, x, y, w, h, f"rounded=1;arcSize=20;whiteSpace=wrap;html=1;fillColor={fill};strokeColor=none;fontColor={color};fontStyle=1;fontSize=13;")

def table(d, x0, y0, cols, rows, rowh=42):
    right = x0 + sum(w for _, w in cols)
    xs, xx = [], right
    for _, w in cols:
        xx -= w
        xs.append(xx)
    rect(d, x0, y0, right - x0, 36, "#f1f5f9", "#e2e8f0")
    for (name, w), x in zip(cols, xs):
        txt(d, name, x + 8, y0, w - 16, 36, 12, "#475569", "right", True)
    for r, row in enumerate(rows):
        y = y0 + 36 + r * rowh
        rect(d, x0, y, right - x0, rowh, "#ffffff", "#f1f5f9")
        for (cell, (_, w), x) in zip(row, cols, xs):
            color = "#334155"
            if isinstance(cell, tuple):
                cell, color = cell
            txt(d, cell, x + 8, y, w - 16, rowh, 12, color, "right")

# =====================================================================
# MOBILE SCREENS (trainee, 390 x 844)
# =====================================================================
PW, PH = 390, 844
G = "endArrow=none;html=1;strokeColor=#22c55e;strokeWidth=5;"
R = "endArrow=none;html=1;strokeColor=#ef4444;strokeWidth=5;"
GT = "endArrow=none;html=1;strokeColor=#22c55e;strokeWidth=3;"

def phone(d, bg="#f8fafc"):
    d.v("", 0, 0, PW, PH, f"rounded=1;arcSize=5;whiteSpace=wrap;html=1;fillColor={bg};strokeColor=#475569;strokeWidth=3;")

def circle(d, val, x, y, w, h, fill, stroke="none", extra=""):
    return d.v(val, x, y, w, h, f"ellipse;whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};{extra}")

# --- Screen 1: trainee home
m1 = D("מסך 1 – בית מתאמן (טלפון)", 440, 1000)
phone(m1)
rect(m1, 0, 0, PW, 56, "#0f172a", "#0f172a")
txt(m1, "<b>FitVision</b> AI", 200, 8, 174, 40, 18, "#ffffff")
circle(m1, "י", 16, 12, 32, 32, "#334155", extra="fontColor=#ffffff;fontStyle=1;")
txt(m1, "בוקר טוב, יוסי", 16, 66, 358, 32, 20, "#0f172a", "right", True)
txt(m1, "יום רביעי · אימון שלישי השבוע", 16, 96, 358, 22, 13, "#64748b")
card(m1, 16, 132, 358, 300)
txt(m1, "האימון של היום", 32, 140, 326, 24, 13, "#64748b")
txt(m1, "גוף מלא A", 32, 162, 326, 32, 20, "#0f172a", "right", True)
txt(m1, "4 תרגילים · כ-40 דקות · מאמן: רון", 32, 194, 326, 22, 12, "#64748b")
for i, (name, sets) in enumerate([("סקוואט", "4 × 12"), ("לאנג'ים", "4 × 10"), ("כפיפת מרפקים", "4 × 12"), ("לחיצת כתפיים", "3 × 10")]):
    y = 226 + i * 36
    rect(m1, 32, y, 326, 30, "#f8fafc", "#e2e8f0", extra="rounded=1;arcSize=20;")
    txt(m1, name, 120, y, 228, 30, 13, "#334155")
    txt(m1, sets, 42, y, 80, 30, 13, "#64748b", "left")
btn(m1, "▶  התחל אימון", 32, 376, 326, 44, "#2563eb")
card(m1, 16, 448, 358, 150)
txt(m1, "האימון האחרון · 26.10", 32, 456, 326, 24, 12, "#64748b")
txt(m1, "84%", 32, 480, 120, 40, 28, "#16a34a", "left", True)
txt(m1, "ציון טכניקה", 190, 480, 168, 20, 12, "#64748b")
txt(m1, "↑ 6% לעומת הממוצע", 190, 500, 168, 20, 12, "#16a34a")
txt(m1, "נקודה לשיפור: הברכיים קורסות פנימה בסקוואט", 32, 526, 326, 36, 13, "#334155")
txt(m1, "לסיכום המלא ←", 32, 564, 326, 24, 13, "#2563eb", "right", True)
card(m1, 16, 614, 358, 100)
txt(m1, "💬 הערה חדשה מהמאמן", 32, 622, 326, 24, 13, "#0f172a", "right", True)
txt(m1, "\"להוסיף גומייה מעל הברכיים בסקוואט באימון הבא\"", 32, 646, 326, 40, 12, "#475569")
txt(m1, "רון אברהם · לפני שעתיים", 32, 686, 326, 20, 11, "#94a3b8")
rect(m1, 0, 780, PW, 64, "#ffffff", "#e2e8f0")
for i, (icon, lbl) in enumerate([("🏠", "בית"), ("📈", "היסטוריה"), ("📋", "התוכנית"), ("👤", "פרופיל")]):
    x = PW - (i + 1) * 97.5
    col = "#2563eb" if i == 0 else "#64748b"
    txt(m1, f"{icon}<br>{lbl}", x, 788, 97.5, 48, 11, col, "center", i == 0)
note(m1, "<b>הערות אפיון:</b> מסך הפתיחה של המתאמן. האימון של היום נטען מהתוכנית הפעילה (WorkoutPlans). כרטיס \"האימון האחרון\" מציג את ציון הטכניקה ואת מגמת השיפור לפי BR-04. הערת מאמן חדשה מוצגת עד שהמתאמן פותח אותה. US-04, US-07, US-08.", 0, 870, 390, 120)

# --- Screen 2: workout setup
m2 = D("מסך 2 – הכנה לאימון (טלפון)", 440, 1000)
phone(m2)
rect(m2, 0, 0, PW, 56, "#ffffff", "#e2e8f0")
txt(m2, "→", 340, 8, 34, 40, 22, "#0f172a", "center")
txt(m2, "הכנה לאימון: סקוואט", 16, 8, 318, 40, 17, "#0f172a", "right", True)
card(m2, 16, 72, 358, 220)
txt(m2, "מיקום הטלפון: מבט מהחזית", 32, 80, 326, 22, 13, "#0f172a", "right", True)
m2.ln(40, 246, 350, 246, "endArrow=none;html=1;strokeColor=#94a3b8;strokeWidth=2;")
circle(m2, "", 268, 132, 26, 26, "none", "#334155", "strokeWidth=3;")
for a, b in [((281, 158), (281, 206)), ((281, 206), (268, 246)), ((281, 206), (294, 246)), ((281, 170), (266, 200)), ((281, 170), (296, 200))]:
    m2.ln(*a, *b, "endArrow=none;html=1;strokeColor=#334155;strokeWidth=3;")
rect(m2, 78, 212, 20, 34, "#0f172a", "#0f172a", extra="rounded=1;arcSize=25;")
m2.ln(100, 228, 258, 228, "endArrow=classic;startArrow=classic;html=1;strokeColor=#2563eb;dashed=1;")
txt(m2, "2-3 מטר", 130, 204, 100, 20, 12, "#2563eb", "center", True)
txt(m2, "הצב את הטלפון על הרצפה או על מעמד, בגובה המותניים", 32, 256, 326, 30, 12, "#64748b")
card(m2, 16, 308, 358, 150)
txt(m2, "בדיקות לפני תחילת הסט", 32, 316, 326, 24, 13, "#0f172a", "right", True)
for i, (icon, line, col) in enumerate([("✓", "כל הגוף בתוך הפריים", "#16a34a"), ("✓", "התאורה מספקת", "#16a34a"), ("!", "זוהו 31 מתוך 33 נקודות – התרחק מעט", "#ca8a04")]):
    y = 346 + i * 34
    circle(m2, icon, 334, y + 2, 24, 24, col, extra="fontColor=#ffffff;fontStyle=1;fontSize=13;")
    txt(m2, line, 32, y, 294, 28, 13, "#334155")
card(m2, 16, 474, 358, 176)
rect(m2, 28, 484, 334, 156, "#1f2937", "#111827", extra="rounded=1;arcSize=6;")
txt(m2, "● תצוגה מקדימה", 40, 490, 160, 20, 11, "#86efac", "left", True)
circle(m2, "", 187, 506, 18, 18, "none", "#22c55e", "strokeWidth=3;")
for a, b in [((196, 524), (196, 576)), ((196, 534), (178, 560)), ((196, 534), (214, 560)), ((196, 576), (184, 626)), ((196, 576), (208, 626))]:
    m2.ln(*a, *b, GT)
txt(m2, "🔒 הווידאו מעובד בטלפון בלבד ואינו נשמר או נשלח", 16, 662, 358, 24, 12, "#475569", "center")
btn(m2, "אני מוכן – התחל סט 1", 16, 700, 358, 50, "#2563eb")
txt(m2, "הסט יתחיל אחרי ספירה לאחור של 5 שניות", 16, 756, 358, 22, 11, "#64748b", "center")
note(m2, "<b>הערות אפיון:</b> מוצג לפני כל תרגיל. כיוון המצלמה (צד או חזית) נקבע לפי Exercises.camera_view. הכפתור פעיל רק כשכל הבדיקות עוברות. בשימוש הראשון מוצג לפני מסך זה מסך הסכמה לשימוש במצלמה (NFR-08). US-04.", 0, 870, 390, 120)

# --- Screen 3: live workout
m3 = D("מסך 3 – אימון חי (טלפון)", 440, 1000)
phone(m3, "#1f2937")
rect(m3, 0, 0, PW, 64, "#0f172a", "#0f172a")
txt(m3, "סקוואט · סט 2 מתוך 4", 100, 8, 274, 26, 15, "#ffffff", "right", True)
txt(m3, "⏱ 00:18:42 · גוף מלא A", 100, 34, 274, 22, 12, "#cbd5e1")
btn(m3, "■ סיום", 16, 14, 76, 36, "#dc2626")
circle(m3, "<b style='font-size:36px'>7</b><span style='font-size:18px'>/12</span><br><span style='font-size:12px'>חזרות</span>", 16, 80, 120, 120, "#0f172a", "#22c55e", "strokeWidth=4;fontColor=#ffffff;")
rect(m3, 254, 88, 120, 56, "#0f172a", "none", "<b style='font-size:20px'>84%</b><br>ציון הסט", "rounded=1;arcSize=20;fontColor=#ffffff;fontSize=12;")
txt(m3, "● זיהוי 33/33", 254, 150, 120, 22, 11, "#86efac", "center", True)
circle(m3, "", 180, 222, 30, 30, "none", "#22c55e", "strokeWidth=4;")
J = {"neck": (195, 252), "ls": (160, 280), "rs": (230, 280), "sm": (195, 280), "le": (138, 330), "re": (252, 330),
     "lh": (156, 372), "rh": (234, 372), "hm": (195, 400), "lhip": (172, 400), "rhip": (218, 400),
     "lk": (182, 500), "rk": (208, 500), "la": (150, 600), "ra": (240, 600)}
for a, b, s in [("neck", "sm", G), ("ls", "rs", G), ("sm", "hm", G), ("ls", "le", G), ("rs", "re", G), ("le", "lh", G), ("re", "rh", G),
                ("lhip", "rhip", G), ("lhip", "lk", R), ("rhip", "rk", R), ("lk", "la", R), ("rk", "ra", R)]:
    m3.ln(*J[a], *J[b], s)
for k, (x, y) in J.items():
    if k not in ("sm", "hm", "neck"):
        circle(m3, "", x - 6, y - 6, 12, 12, "#ffffff", "#0f172a")
m3.ln(176, 500, 132, 500, "endArrow=classic;html=1;strokeColor=#fca5a5;strokeWidth=3;")
m3.ln(214, 500, 258, 500, "endArrow=classic;html=1;strokeColor=#fca5a5;strokeWidth=3;")
txt(m3, "קריסה<br>פנימה", 264, 470, 80, 40, 13, "#fca5a5", "left", True)
m3.ln(24, 610, 366, 610, "endArrow=none;html=1;strokeColor=#64748b;dashed=1;")
rect(m3, 16, 636, 358, 68, "#dc2626", "none", "⚠ דחוף את הברכיים החוצה<br><span style='font-size:12px;font-weight:normal'>🔊 משוב קולי פעיל</span>", "rounded=1;arcSize=14;fontColor=#ffffff;fontStyle=1;fontSize=18;")
rect(m3, 0, 720, PW, 124, "#0f172a", "#0f172a", extra="rounded=1;arcSize=5;")
txt(m3, "סט 1 ✓ 88%  ·  <b>סט 2</b>  ·  סט 3  ·  סט 4", 16, 728, 358, 24, 12, "#cbd5e1", "center")
btn(m3, "⏸ השהה", 16, 764, 171, 52, "#475569")
btn(m3, "סיום סט ✓", 203, 764, 171, 52, "#2563eb")
note(m3, "<b>הערות אפיון:</b> השלד מצויר על הווידאו בזמן אמת; מקטעים אדומים = מפרקים שחרגו מכלל טכניקה (TechniqueRules). המונה, הציון והמשוב גדולים כדי שיהיו קריאים ממרחק של 2-3 מטר. בסיום הסט נשלחים לשרת נתוני הסט בלבד. US-05, US-06.", 0, 870, 390, 120)

# --- Screen 2: trainer dashboard
w2 = D("מסך 4 – דשבורד מאמן (מחשב)", 1300, 920)
rect(w2, 0, 0, 1280, 800, "#f8fafc", "#94a3b8")
rect(w2, 1080, 0, 200, 800, "#0f172a", "#0f172a")
txt(w2, "<b>FitVision</b> AI", 1090, 14, 180, 40, 20, "#ffffff", "center")
for i, item in enumerate(["🏠 דשבורד", "👥 המתאמנים שלי", "📋 תוכניות אימון", "📄 דוחות (6 חדשים)", "🔔 התראות", "🏋 מאגר תרגילים", "⚙ הגדרות"]):
    y = 90 + i * 48
    if i == 0:
        rect(w2, 1090, y, 180, 40, "#1e40af", "none", extra="rounded=1;")
    txt(w2, item, 1100, y, 160, 40, 14, "#ffffff" if i == 0 else "#cbd5e1")
txt(w2, "↩ התנתקות", 1100, 740, 160, 36, 13, "#94a3b8")
rect(w2, 0, 0, 1080, 64, "#ffffff", "#e2e8f0")
txt(w2, "שלום, רון 👋", 780, 12, 280, 40, 18, "#0f172a", "right", True)
w2.v("🔍 חיפוש מתאמן...", 320, 14, 340, 36, "rounded=1;arcSize=30;whiteSpace=wrap;html=1;fillColor=#f1f5f9;strokeColor=#e2e8f0;align=right;spacingRight=12;fontColor=#94a3b8;")
txt(w2, "🔔 3", 30, 14, 70, 36, 16, "#dc2626", "center", True)
kpis = [("מתאמנים פעילים", "18", "+2 החודש", "#2563eb"), ("אימונים השבוע", "47", "↑ 12% משבוע שעבר", "#16a34a"),
        ("ציון טכניקה ממוצע", "81%", "↑ 3 נקודות", "#16a34a"), ("דוחות שטרם נצפו", "6", "דורש טיפול", "#dc2626")]
for i, (t, v, s, col) in enumerate(kpis):
    x = 794 - i * 258
    card(w2, x, 80, 245, 100)
    txt(w2, t, x + 12, 88, 221, 24, 13, "#64748b")
    txt(w2, v, x + 12, 112, 221, 40, 30, "#0f172a", "right", True)
    txt(w2, s, x + 12, 150, 221, 22, 12, col)
card(w2, 700, 196, 360, 284)
txt(w2, "⚠ התראות חכמות", 716, 204, 328, 30, 15, "#0f172a", "right", True)
for i, (t, col, bg) in enumerate([("<b>דנה לוי</b> · קריסת ברכיים ב-3 אימונים ברצף (סקוואט)", "#dc2626", "#fef2f2"),
                                  ("<b>אבי מזרחי</b> · ירידה של 9% בציון הטכניקה השבוע", "#ea580c", "#fff7ed"),
                                  ("<b>מאיה פרץ</b> · לא התאמנה 6 ימים", "#ca8a04", "#fefce8")]):
    y = 244 + i * 74
    rect(w2, 716, y, 328, 62, bg, "none", extra="rounded=1;arcSize=8;")
    rect(w2, 1038, y, 6, 62, col, "none")
    txt(w2, t, 726, y, 304, 62, 12, "#334155")
card(w2, 20, 196, 664, 284)
txt(w2, "מגמת ציון טכניקה ממוצע – 8 שבועות אחרונים", 36, 204, 632, 30, 15, "#0f172a", "right", True)
w2.ln(70, 250, 70, 440, "endArrow=none;html=1;strokeColor=#94a3b8;")
w2.ln(70, 440, 660, 440, "endArrow=none;html=1;strokeColor=#94a3b8;")
for v in (70, 80, 90):
    y = 440 - (v - 60) * 6
    txt(w2, str(v), 36, y - 10, 30, 20, 11, "#94a3b8", "center")
    w2.ln(70, y, 660, y, "endArrow=none;html=1;strokeColor=#f1f5f9;")
vals = [72, 74, 73, 77, 78, 80, 79, 83]
pts = [(100 + i * 77, 440 - (v - 60) * 6) for i, v in enumerate(vals)]
w2.ln(*pts[0], *pts[-1], "endArrow=none;html=1;strokeColor=#2563eb;strokeWidth=3;rounded=0;", pts=pts[1:-1])
for i, (x, y) in enumerate(pts):
    w2.v("", x - 5, y - 5, 10, 10, "ellipse;html=1;fillColor=#2563eb;strokeColor=#ffffff;")
    txt(w2, f"ש{i+1}", x - 20, 446, 40, 20, 11, "#94a3b8", "center")
card(w2, 20, 496, 1040, 288)
txt(w2, "המתאמנים שלי", 800, 502, 244, 34, 15, "#0f172a", "right", True)
btn(w2, "+ שיוך מתאמן חדש", 36, 504, 170, 30, "#2563eb")
table(w2, 36, 540, [("שם מתאמן", 190), ("אימון אחרון", 140), ("תרגיל מוביל", 140), ("ציון ממוצע", 110), ("מגמה", 110), ("התראות", 130), ("פעולות", 188)],
      [["דנה לוי", "היום, 08:10", "סקוואט", "71%", ("↓ 4%", "#dc2626"), ("⚠ 1", "#dc2626"), ("צפה בדוח · תוכנית", "#2563eb")],
       ["יוסי כהן", "אתמול", "לחיצת כתפיים", "84%", ("↑ 6%", "#16a34a"), "—", ("צפה בדוח · תוכנית", "#2563eb")],
       ["מאיה פרץ", "לפני 6 ימים", "לאנג'ים", "79%", ("→ 0%", "#64748b"), ("⏳ 1", "#ca8a04"), ("שלח תזכורת", "#2563eb")],
       ["עומר בן דוד", "היום, 07:30", "כפיפת מרפקים", "90%", ("↑ 2%", "#16a34a"), "—", ("צפה בדוח · תוכנית", "#2563eb")],
       ["נועה שטרן", "אתמול", "סקוואט", "82%", ("↑ 5%", "#16a34a"), "—", ("צפה בדוח · תוכנית", "#2563eb")]], 40)
note(w2, "<b>הערות אפיון:</b> המאמן רואה רק מתאמנים עם שיוך בסטטוס Active (RBAC). ההתראות נוצרות מכללים עסקיים: שגיאה זהה ב-3 אימונים רצופים, ירידה &gt; 5% בציון, או חוסר פעילות &gt; 5 ימים. לחיצה על שורה פותחת את פרופיל המתאמן.", 0, 815, 1280, 70)

# --- Screen 3: report view
w3 = D("מסך 5 – דוח סיכום אימון (מחשב)", 1300, 1020)
rect(w3, 0, 0, 1280, 900, "#f8fafc", "#94a3b8")
rect(w3, 0, 0, 1280, 64, "#0f172a", "#0f172a")
txt(w3, "📄 דוח סיכום אימון", 900, 12, 360, 40, 20, "#ffffff", "right", True)
btn(w3, "ייצוא PDF ⬇", 340, 14, 150, 36, "#dc2626")
btn(w3, "ייצוא Excel ⬇", 180, 14, 150, 36, "#0891b2")
btn(w3, "✉ שלח למתאמן", 20, 14, 150, 36, "#16a34a")
card(w3, 20, 80, 1240, 56)
txt(w3, "<b>מתאמן:</b> יוסי כהן &nbsp;&nbsp;·&nbsp;&nbsp; <b>מאמן:</b> רון אברהם &nbsp;&nbsp;·&nbsp;&nbsp; <b>תאריך:</b> 26.10.2026, 18:05 &nbsp;&nbsp;·&nbsp;&nbsp; <b>תוכנית:</b> גוף מלא A &nbsp;&nbsp;·&nbsp;&nbsp; <b>משך:</b> 42 דק'", 40, 80, 1200, 56, 14)
kp = [('סה"כ חזרות', "164", "מתוך 166 מתוכננות", "#64748b"), ("חזרות תקינות", "137", "84% מסך החזרות", "#64748b"),
      ("ציון טכניקה ממוצע", "84%", "↑ 6% לעומת האימון הקודם", "#16a34a"), ("תרגילים שבוצעו", "4 / 4", "15 סטים", "#64748b")]
for i, (t, v, s, col) in enumerate(kp):
    x = 962 - i * 314
    card(w3, x, 152, 298, 96)
    txt(w3, t, x + 14, 160, 270, 24, 13, "#64748b")
    txt(w3, v, x + 14, 184, 270, 38, 30, "#0f172a", "right", True)
    txt(w3, s, x + 14, 220, 270, 22, 12, col)
card(w3, 20, 264, 1240, 250)
txt(w3, "פירוט לפי תרגיל", 1000, 270, 244, 32, 15, "#0f172a", "right", True)
table(w3, 36, 306, [("תרגיל", 200), ("סטים", 90), ("חזרות", 100), ("תקינות", 100), ("ציון טכניקה", 130), ("ROM ממוצע", 130), ("שגיאה עיקרית", 458)],
      [["סקוואט", "4", "46", "37", ("81%", "#ea580c"), "94°", ("ברכיים קורסות פנימה (15% מהחזרות בסט 2)", "#dc2626")],
       ["לאנג'ים", "4", "40", "34", ("85%", "#16a34a"), "88°", "ברך קדמית חורגת מעבר לקו האצבעות"],
       ["כפיפת מרפקים", "4", "48", "42", ("87%", "#16a34a"), "42°", "המרפק מתרחק מהגוף בעלייה"],
       ["לחיצת כתפיים", "3", "30", "24", ("80%", "#ea580c"), "164°", ("ירידה חלקית – לא עד גובה הכתפיים", "#dc2626")]], 40)
card(w3, 20, 530, 600, 350)
txt(w3, "ציון טכניקה לפי סט – סקוואט", 36, 538, 568, 30, 15, "#0f172a", "right", True)
w3.ln(70, 820, 590, 820, "endArrow=none;html=1;strokeColor=#94a3b8;")
for i, sc in enumerate([88, 74, 79, 83]):
    x = 110 + i * 120
    h = (sc - 50) * 6
    col = "#ef4444" if sc < 80 else "#22c55e"
    rect(w3, x, 820 - h, 70, h, col, "none")
    txt(w3, f"{sc}%", x, 820 - h - 26, 70, 22, 13, "#0f172a", "center", True)
    txt(w3, f"סט {i+1}", x, 826, 70, 22, 12, "#64748b", "center")
w3.ln(70, 820 - (80 - 50) * 6, 590, 820 - (80 - 50) * 6, "endArrow=none;html=1;strokeColor=#64748b;dashed=1;")
txt(w3, "סף יעד 80%", 548, 820 - 180 - 22, 70, 20, 11, "#64748b", "left")
card(w3, 640, 530, 620, 150)
txt(w3, "🔍 נקודות כשל ותובנות", 656, 538, 588, 30, 15, "#0f172a", "right", True)
txt(w3, "• <b>סקוואט</b> – בסט השני הברכיים קרסו פנימה ב-15% מהחזרות<br>• <b>לחיצת כתפיים</b> – ירידה חלקית ב-3 החזרות האחרונות של סט 3 (סימן לעייפות)<br>• <span style='color:#16a34a'><b>שיפור:</b> עומק הסקוואט השתפר מ-101° ל-94° בממוצע</span>",
    656, 568, 588, 106, 13, "#334155", "right", extra="verticalAlign=top;")
card(w3, 640, 696, 620, 184)
txt(w3, "✍ הערות מאמן", 656, 702, 588, 30, 15, "#0f172a", "right", True)
w3.v("לעבוד על הפעלת שריר עכוז אמצעי – להוסיף גומייה מעל הברכיים בסקוואט באימון הבא...", 656, 736, 588, 90, "rounded=1;arcSize=6;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#cbd5e1;align=right;verticalAlign=top;spacing=10;fontColor=#94a3b8;fontSize=13;")
btn(w3, "שמור הערה", 1104, 834, 140, 36, "#2563eb")
note(w3, "<b>הערות אפיון:</b> הדוח נוצר אוטומטית בסיום אימון (Reports, סטטוס Draft) ועובר ל-Reviewed לאחר שהמאמן צפה/הוסיף הערה. ייצוא PDF/Excel ושליחה למתאמן נרשמים בטבלת ReportDeliveries. מגמת שיפור לפי BR-04: השוואה לממוצע 3 האימונים הקודמים באותו תרגיל.", 0, 915, 1280, 70)

save("FitVision_Wireframes.drawio", [m1, m2, m3, w2, w3])
print("ok")
