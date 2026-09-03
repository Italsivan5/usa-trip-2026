# V12 Weather Update

להעלות ל-GitHub ולהחליף רק:
- index.html
- weather.js
- sw.js

לא להחליף:
- config.js
- cloud.js
- manifest.webmanifest
- קבצי Supabase / SQL

אין שינוי ב-Supabase ואין API key למזג האוויר.
Open-Meteo נקרא ישירות מהדפדפן.

לאחר Commit:
1. להמתין ש-GitHub Pages יסיים Deployment.
2. לפתוח את האתר ולבצע Refresh.
3. בכרטיסי הימים יופיע מזג האוויר כאשר התאריך בתוך טווח התחזית.
4. ימים רחוקים יותר יציגו שהתחזית תופיע אוטומטית בהמשך.
5. התחזית האחרונה נשמרת מקומית ומשמשת גם כאשר אין אינטרנט.
