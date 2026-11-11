---
title: "FitVision AI"
subtitle: "מערכת מידע לניתוח טכניקת אימון באמצעות ראייה ממוחשבת והפקת דוחות מעקב למאמני כושר"
author:
  - "מסמך אפיון – פרויקט גמר א'"
  - "מגישים: [שם מלא, ת.ז.] · [שם מלא, ת.ז.] · [שם מלא, ת.ז.] · [שם מלא, ת.ז.]"
  - "מנחה: [שם המנחה]"
date: "החוג למערכות מידע, אוניברסיטת חיפה · שנה\"ל תשפ\"ח"
dir: rtl
lang: he-IL
toc-title: "תוכן עניינים"
---

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# תקציר

מתאמנים רבים מתאמנים כיום ללא השגחה צמודה של איש מקצוע, בבית או בחדר כושר פתוח. כתוצאה מכך הם מבצעים תרגילים בטכניקה שגויה ללא משוב אובייקטיבי, ונחשפים לסיכון מוגבר לפציעות. במקביל, למאמני כושר אין דרך שיטתית לעקוב אחר ביצועי המתאמנים מרחוק, והם נאלצים להסתמך על דיווח עצמי סובייקטיבי.

הפרויקט מציע את FitVision AI: מערכת מידע מבוססת-ווב המשלבת מנוע ראייה ממוחשבת לניתוח תנועה בזמן אמת עם מערכת ניהולית למעקב ובקרה. המערכת מזהה את שלד המתאמן מתוך מצלמת הדפדפן באמצעות ספריית MediaPipe, מחשבת זוויות מפרקים, סופרת חזרות ומשווה כל חזרה לכללי טכניקה מוגדרים מראש. המתאמן מקבל משוב חזותי וקולי מיידי על שגיאות יציבה.

ליבת הפרויקט היא רכיב מערכות המידע. המערכת מנהלת שלושה סוגי משתמשים (מתאמן, מאמן ומנהל מערכת) במודל הרשאות מבוסס-תפקידים (RBAC), ומתעדת כל אימון ברמת הסט, החזרה ואירוע השגיאה. בסיום כל אימון מופק אוטומטית דוח סיכום אנליטי למאמן, הכולל כמות חזרות, ציון טכניקה, נקודות כשל חוזרות ומגמת שיפור ביחס לאימונים קודמים. המאמן יכול להוסיף הערות, לייצא את הדוח כקובץ PDF או Excel ולשלוח אותו למתאמן. כללי הטכניקה נשמרים כנתונים הניתנים לעריכה על ידי מנהל המערכת, ולא כקוד קשיח, כך שניתן להרחיב את מאגר התרגילים ללא פיתוח נוסף.

מטעמי פרטיות, הווידאו מעובד בצד הלקוח בלבד ואינו נשמר; לשרת מועברים נתונים מספריים בלבד. המערכת תפותח ב-React בצד הלקוח, Python (FastAPI) בצד השרת ו-SQL Server כמסד נתונים. תוצרי הניתוח כוללים דיאגרמת Use Case, דיאגרמות DFD ברמות 0 ו-1, דיאגרמת ERD ואפיון ממשקי משתמש. גרסת ה-MVP תתמוך בארבעה תרגילים: סקוואט, לאנג'ים, כפיפת מרפקים (Bicep Curl) ולחיצת כתפיים (Shoulder Press). התרגילים נבחרו כך שמצלמת טלפון אחת תזהה אותם באמינות: כולם מבוצעים בעמידה, כל הגוף נראה בפריים, והמפרק העיקרי נע בזווית רחבה ובמישור אחד מול המצלמה.

**מילות מפתח:** מערכות מידע, ראייה ממוחשבת, הערכת תנוחה (Pose Estimation), ניהול משתמשים והרשאות, הפקת דוחות, טכנולוגיית כושר

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

::: {dir="ltr"}
# Abstract

Many people train without professional supervision, performing exercises with poor technique and no objective feedback, which increases injury risk. Fitness trainers, in turn, lack a systematic way to monitor trainees remotely and rely on subjective self-reports.

FitVision AI is a web-based information system that combines real-time computer-vision movement analysis with a management layer for trainers. Using MediaPipe pose estimation in the browser, the system tracks joint angles, counts repetitions and checks each rep against configurable technique rules, giving the trainee immediate visual and audio feedback.

The core of the project is its information-system component: role-based access control for trainees, trainers and administrators; structured logging of every session at the set, repetition and error-event level; and an automatic reporting engine that produces an analytical post-workout report for the trainer, covering reps, technique score, recurring faults and progress over previous sessions. Trainers can annotate reports, export them as PDF or Excel, and send them to trainees. For privacy, video is processed client-side only and never stored. The system will be built with React, Python (FastAPI) and SQL Server.

**Keywords:** information systems, computer vision, pose estimation, role-based access control, automated reporting, fitness technology

:::

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

