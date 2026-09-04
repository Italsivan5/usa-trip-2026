# V13.1 — PWA Root Icons Fix

הקבצים icon-192.png ו-icon-512.png אצלך נמצאים בשורש ה-Repository, ליד index.html.
גרסה זו מתקנת את כל ההפניות כך שיתאימו למבנה הזה.

## להחליף ב-GitHub רק:
- index.html
- sw.js
- manifest.webmanifest

## להשאיר כפי שהם:
- icon-192.png
- icon-512.png
- config.js
- cloud.js
- weather.js
- offline.html
- תיקיית SQL / Supabase
- כל יתר הקבצים

## אחרי ה-Commit:
1. להמתין ש-GitHub Pages יסיים Deployment.
2. בטלפון למחוק את קיצור הדרך הישן שכבר נוצר.
3. לפתוח את כתובת האתר ב-Chrome.
4. לבצע Reload / Refresh.
5. להמתין 10-20 שניות.
6. לסגור את הטאב ולפתוח שוב את האתר.
7. Chrome > ⋮ > התקנה ויצירת קיצור דרך.
8. לבדוק אם כעת מוצעת "התקנה" ולא רק "יצירת קיצור דרך".

## בדיקה מהירה
הכתובות הבאות צריכות להציג תמונה ולא 404:
- .../icon-192.png
- .../icon-512.png

והכתובת:
- .../manifest.webmanifest

צריכה לפתוח את קובץ ה-manifest.
