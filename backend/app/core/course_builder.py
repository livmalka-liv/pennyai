"""
AI Course Builder — generates personalized trading courses using Claude.
Courses are based on Live Lab data (real trades, win rates, patterns).
"""

import json
import logging
from datetime import date
from collections import defaultdict

logger = logging.getLogger(__name__)

TIER_LIMITS = {
    "free": 3,
    "starter": 15,
    "pro": 9999,
}

TIER_PRICE_ILS = {
    "starter": 59,
    "pro": 149,
}

EXTRA_STRATEGY_PRICE_ILS = 12


def get_strategy_stats(db, strategy_id: str) -> dict:
    from app.models.db_models import PaperTrade
    trades = db.query(PaperTrade).filter(
        PaperTrade.strategy_id == strategy_id,
        PaperTrade.status.in_(["win", "loss"])
    ).all()

    if not trades:
        return {}

    wins = [t for t in trades if t.status == "win"]
    losses = [t for t in trades if t.status == "loss"]
    win_rate = len(wins) / len(trades) * 100

    # Best hour
    by_hour: dict[str, dict] = defaultdict(lambda: {"w": 0, "l": 0})
    for t in trades:
        h = t.hour_bucket or "?"
        if t.status == "win":
            by_hour[h]["w"] += 1
        else:
            by_hour[h]["l"] += 1

    best_hour = max(by_hour, key=lambda h: by_hour[h]["w"] / max(by_hour[h]["w"] + by_hour[h]["l"], 1))

    # Best price bucket
    by_price: dict[str, dict] = defaultdict(lambda: {"w": 0, "l": 0})
    for t in trades:
        p = t.price_bucket or "?"
        if t.status == "win":
            by_price[p]["w"] += 1
        else:
            by_price[p]["l"] += 1

    best_price = max(by_price, key=lambda p: by_price[p]["w"] / max(by_price[p]["w"] + by_price[p]["l"], 1))

    avg_win = sum(t.return_pct or 0 for t in wins) / len(wins) if wins else 0
    avg_loss = sum(t.return_pct or 0 for t in losses) / len(losses) if losses else 0
    total_pnl = sum((t.dollars_gain or 0) for t in trades)
    dates = {t.trade_date for t in trades}

    return {
        "total_trades": len(trades),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": round(win_rate, 1),
        "total_pnl": round(total_pnl, 2),
        "avg_win_pct": round(avg_win, 1),
        "avg_loss_pct": round(avg_loss, 1),
        "best_hour": best_hour,
        "best_price_range": best_price,
        "days_tested": len(dates),
        "by_hour": {h: v for h, v in by_hour.items()},
        "by_price": {p: v for p, v in by_price.items()},
    }


def _build_prompt(strategy_name: str, strategy_config: dict, stats: dict) -> str:
    has_data = bool(stats)

    data_section = ""
    if has_data:
        data_section = f"""
## נתוני Live Lab אמיתיים — חשבון הלייב של המשתמש:
- סה"כ עסקאות שנבדקו: {stats['total_trades']}
- ניצחונות / הפסדים: {stats['wins']} / {stats['losses']}
- אחוז הצלחה: {stats['win_rate']}%
- רווח כולל: ${stats['total_pnl']}
- ממוצע ניצחון: +{stats['avg_win_pct']}%
- ממוצע הפסד: {stats['avg_loss_pct']}%
- שעה הטובה ביותר (ישראל): {stats['best_hour']}
- טווח מחיר טוב ביותר: {stats['best_price_range']}
- ימי בדיקה: {stats['days_tested']}

הקורס חייב להתייחס לנתונים הספציפיים האלה ולהסביר למה {stats['best_hour']} יוצא טוב יותר, ולמה {stats['best_price_range']} הוא הטווח המנצח.
"""
    else:
        data_section = """
## מצב: אין עדיין מספיק נתוני Live Lab — בנה קורס תיאורטי מקצועי.
הסבר את האסטרטגיה כמו שהיית מלמד טריידר מנוסה.
"""

    return f"""בנה קורס מסחר מקצועי ומלא על האסטרטגיה "{strategy_name}" עבור פני סטוקס.

{data_section}

## פרמטרים של האסטרטגיה:
- כניסה: {strategy_config.get('entry', 'HOD')}
- Float מקסימלי: {strategy_config.get('max_float', 10_000_000) / 1_000_000:.0f}M מניות
- RVOL מינימלי: {strategy_config.get('min_rvol', 5)}x
- טווח מחיר: ${strategy_config.get('min_price', 1)}–${strategy_config.get('max_price', 20)}
- Take Profit: +{strategy_config.get('tp_pct', 20)}%
- Stop Loss: {strategy_config.get('sl_pct', -7)}%

## הוראות:
החזר JSON תקני (ללא markdown, ללא ```json, רק JSON גולמי) עם המבנה הבא בדיוק:

{{
  "title": "שם הקורס בעברית",
  "subtitle": "תת כותרת",
  "duration_hours": 3,
  "difficulty": "מתחיל/בינוני/מתקדם",
  "modules": [
    {{
      "number": 1,
      "title": "כותרת המודול",
      "type": "theory/criteria/risk/psychology/live_data/action",
      "duration_minutes": 15,
      "content": "הסבר מלא ומפורט (לפחות 200 מילים) על המודול הזה. פרט, הסבר למה, תן דוגמאות.",
      "key_points": ["נקודה 1", "נקודה 2", "נקודה 3"],
      "quiz": [
        {{
          "question": "שאלה לבדיקת הבנה",
          "options": ["תשובה א", "תשובה ב", "תשובה ג", "תשובה ד"],
          "correct": 0,
          "explanation": "הסבר למה התשובה נכונה"
        }}
      ]
    }}
  ],
  "checklist": ["פריט 1 לצ'קליסט לפני עסקה", "פריט 2", "פריט 3"],
  "common_mistakes": ["טעות נפוצה 1", "טעות נפוצה 2"],
  "ai_insights": "תובנות ספציפיות מהנתונים האמיתיים (אם יש) — למה השעה הטובה ביותר היא הכי טובה, מה מיוחד בטווח המחיר המנצח, המלצות אישיות."
}}

הקורס חייב לכלול 6 מודולים:
1. למה האסטרטגיה עובדת (פסיכולוגיה של השוק)
2. קריטריוני סריקה וכניסה (הגדרות ברורות)
3. ניהול סיכונים (TP, SL, גודל פוזיציה)
4. פסיכולוגיה של הטריידר (דיסציפלינה, טעויות נפוצות)
5. ניתוח נתוני ה-Live Lab (שעות, מחירים, RVOL — אם יש נתונים)
6. תוכנית פעולה יומית (שגרת בוקר, אמצע יום, סגירה)

כתוב בעברית. תוכן מקצועי ברמה של קורס בתשלום של $500."""


async def generate_course(strategy_id: str, strategy_config: dict, stats: dict) -> dict:
    from app.core.config import get_settings
    settings = get_settings()

    strategy_name = strategy_config.get("name", strategy_id)

    if not settings.anthropic_api_key or settings.use_mock_llm:
        return _mock_course(strategy_name, stats)

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        prompt = _build_prompt(strategy_name, strategy_config, stats)

        message = client.messages.create(
            model="claude-opus-4-7",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()

        # Clean up if wrapped in ```json
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        course = json.loads(raw)
        course["strategy_id"] = strategy_id
        course["generated_at"] = date.today().isoformat()
        course["personal_stats"] = stats
        course["is_mock"] = False
        return course

    except Exception as e:
        logger.error(f"Course generation failed: {e}")
        return _mock_course(strategy_name, stats)


def _mock_course(strategy_name: str, stats: dict) -> dict:
    win_rate = stats.get("win_rate", 0)
    best_hour = stats.get("best_hour", "16:00")
    best_price = stats.get("best_price_range", "$1-3")

    return {
        "title": f"קורס מקצועי: {strategy_name}",
        "subtitle": "מבוסס נתוני בדיקה אמיתיים מה-Live Lab",
        "duration_hours": 3,
        "difficulty": "בינוני",
        "modules": [
            {
                "number": 1,
                "title": f"למה {strategy_name} עובד בפני סטוקס",
                "type": "theory",
                "duration_minutes": 15,
                "content": f"אסטרטגיית {strategy_name} מנצלת דינמיקת מחיר ייחודית בפני סטוקס — מניות עם float נמוך ונפח חריג. כשמניה עם float של פחות מ-10 מיליון מניות מתחילה לנוע, אין מספיק היצע ב-order book כדי לבלום את התנועה. הקונים נאלצים לשלם יותר ויותר, מה שיוצר את הספייק החד האופייני. האסטרטגיה שלנו נכנסת בנקודה שבה הסיכוי גבוה שהתנועה תמשך — לאחר שמנסים קצרים נכנעים ומדלידים שקונים ב-FOMO.",
                "key_points": [
                    f"Float נמוך = פחות מניות = תנועה חדה יותר",
                    f"RVOL גבוה מעיד שמשהו אמיתי קורה",
                    f"הכי טוב לפי הנתונים שלך: {best_hour} שעון ישראל",
                ],
                "quiz": [
                    {
                        "question": "למה float נמוך גורם לתנועות חדות יותר?",
                        "options": [
                            "כי יש פחות קונים",
                            "כי יש פחות מניות זמינות — קונים מתחרים על היצע מוגבל",
                            "כי המניה זולה",
                            "כי הברוקרים אוהבים אותה"
                        ],
                        "correct": 1,
                        "explanation": "עם מעט מניות בשוק, כל קנייה גדולה מוציאה מנית את ההיצע ומאלצת את המחיר לטפס."
                    }
                ]
            },
            {
                "number": 2,
                "title": "קריטריוני סריקה וכניסה",
                "type": "criteria",
                "duration_minutes": 20,
                "content": f"לפני כל עסקה, המניה חייבת לעמוד בכל הקריטריונים הבאים. אל תגמיש אף אחד. הניסיון מ-{stats.get('days_tested', 30)} ימי בדיקה בחשבון שלך מאשר שהקריטריונים האלה מסננים את העסקאות הגרועות. אחוז ההצלחה שלנו הגיע ל-{win_rate}% בדיוק בגלל שלא התפשרנו.",
                "key_points": [
                    f"מחיר: {best_price} — הטווח שעובד הכי טוב בחשבון שלך",
                    "RVOL: לפחות 5x ממוצע 30 יום",
                    "Float: מתחת ל-15 מיליון מניות",
                    "שינוי יומי: מעל 10% מהסגירה הקודמת",
                    "נפח: מעל 500,000 מניות"
                ],
                "quiz": [
                    {
                        "question": "מניה עם RVOL של 3x — כדאי להיכנס?",
                        "options": [
                            "כן, 3x מספיק",
                            "לא — מתחת ל-5x לא מספיק פעילות חריגה",
                            "תלוי במחיר",
                            "רק אם הפלואט נמוך"
                        ],
                        "correct": 1,
                        "explanation": "RVOL מתחת ל-5x מעיד שהפעילות לא יוצאת דופן. חכה למניות עם פעילות אמיתית."
                    }
                ]
            },
            {
                "number": 3,
                "title": "ניהול סיכונים — TP, SL וגודל פוזיציה",
                "type": "risk",
                "duration_minutes": 25,
                "content": "ניהול סיכונים הוא ההבדל בין טריידר שעושה כסף לבין טריידר שמפסיד. אנחנו לא מנחשים — אנחנו מגדירים מראש: עד כמה אנחנו מוכנים להפסיד (Stop Loss) ואיפה אנחנו לוקחים רווח (Take Profit). עם פוזיציה של $500 לעסקה, ה-SL של 7% אומר שהפסד מקסימלי הוא $35 לעסקה. זה הסכום שאתה מוכן להפסיד לפני שאתה מצא.",
                "key_points": [
                    "לעולם לא יותר מ-2% מהחשבון לעסקה אחת",
                    "הגדר SL לפני הכניסה — לא אחרי",
                    "TP שמגדיר יחס R:R של לפחות 2:1",
                    "מכסה לפי TP אוטומטי — לא מחכה לעוד"
                ],
                "quiz": [
                    {
                        "question": "חשבון של $10,000. כמה לסכן בעסקה אחת?",
                        "options": ["$1,000 (10%)", "$500 (5%)", "$200 (2%)", "כמה שצריך"],
                        "correct": 2,
                        "explanation": "כלל ה-2%: לעולם לא יותר מ-2% לעסקה. עם $200 סיכון אתה יכול להפסיד 50 עסקאות ברצף לפני שנגמר לך הכסף."
                    }
                ]
            },
            {
                "number": 4,
                "title": "פסיכולוגיה של הטריידר",
                "type": "psychology",
                "duration_minutes": 20,
                "content": "80% מהטריידרים מפסידים לא כי האסטרטגיה שלהם גרועה — אלא כי הם לא מסוגלים ליישם אותה עקבית. FOMO (פחד להחמיץ) גורם לכניסה מאוחרת. ביטול ה-SL גורם להפסדים קטסטרופליים. מסחר נקמה אחרי הפסד מוחק ניצחונות. הפתרון: ה-AI שלנו עושה את ההחלטות — אתה רק מאשר.",
                "key_points": [
                    "אל תזיז את ה-SL לאחר הכניסה",
                    "אחרי 3 הפסדים ברצף — עצור ל-24 שעות",
                    "אל תיכנס ל-FOMO לסיגנל שכבר רץ",
                    "תעד כל עסקה — הצלחות וכישלונות"
                ],
                "quiz": [
                    {
                        "question": "הפסדת 3 עסקאות ברצף. מה עושים?",
                        "options": [
                            "מכפילים את הפוזיציה כדי להחזיר",
                            "עוצרים ל-24 שעות ובודקים מה קרה",
                            "ממשיכים — הפסדים קורים",
                            "עוברים לאסטרטגיה אחרת"
                        ],
                        "correct": 1,
                        "explanation": "3 הפסדים ברצף הם סימן לעצור ולנתח. אולי תנאי השוק השתנו. 24 שעות מנוחה ובחינה."
                    }
                ]
            },
            {
                "number": 5,
                "title": f"ניתוח נתוני Live Lab — החשבון שלך",
                "type": "live_data",
                "duration_minutes": 15,
                "content": f"אחרי {stats.get('days_tested', '?')} ימי בדיקה אמיתית, המערכת מצאה דפוסים ברורים בחשבון שלך. השעה {best_hour} מוציאה אחוז הצלחה גבוה יותר מכל שעה אחרת — כנראה כי זהו חלון זמן שבו הנזילות מתמקדת ויש פחות רעש בשוק. טווח המחיר {best_price} עובד הכי טוב כי מניות בטווח הזה יש להן float מתאים ויכולת תנועה של 15-25% ביום.",
                "key_points": [
                    f"שעה מנצחת: {best_hour} — התמקד בה",
                    f"מחיר מנצח: {best_price} — האיזון הכי טוב",
                    f"אחוז הצלחה כולל: {win_rate}%",
                    f"ממוצע ניצחון: +{stats.get('avg_win_pct', 0)}% | ממוצע הפסד: {stats.get('avg_loss_pct', 0)}%"
                ],
                "quiz": [
                    {
                        "question": f"לפי הנתונים שלך, מה השעה הטובה ביותר לכניסה?",
                        "options": [f"{best_hour}", "14:00", "20:00", "09:30 ET"],
                        "correct": 0,
                        "explanation": f"הנתונים האמיתיים שלך מראים שב-{best_hour} אחוז ההצלחה הגבוה ביותר."
                    }
                ]
            },
            {
                "number": 6,
                "title": "תוכנית פעולה יומית",
                "type": "action",
                "duration_minutes": 10,
                "content": "כדי להיות עקבי, תצטרך שגרה יומית ברורה. בוקר: בדוק את הסורק ב-11:00 שעון ישראל. בחן את המניות הראשונות, בדוק שעומדות בקריטריונים. אמצע יום: עקוב אחר הסיגנלים הפתוחים — לא תגביל, תן ל-TP/SL לעשות את העבודה. ערב: בדוק את הסיכום היומי. מה עבד? מה לא? רשום בטבלה.",
                "key_points": [
                    "11:00-13:00 ישראל: סריקת pre-market ופתיחה",
                    "15:30-17:00 ישראל: מסחר בשעת הפתיחה האמריקאית (הכי חשוב)",
                    "22:00-23:00 ישראל: סגירה ובדיקה",
                    "שמור יומן עסקאות — זה החלק הכי חשוב"
                ],
                "quiz": [
                    {
                        "question": "מתי הזמן הכי חשוב לפעילות בשוק האמריקאי?",
                        "options": [
                            "11:00 ישראל (pre-market)",
                            "15:30-17:00 ישראל (פתיחת ניו יורק)",
                            "20:00 ישראל",
                            "23:00 ישראל"
                        ],
                        "correct": 1,
                        "explanation": "15:30 ישראל = 09:30 ET = פתיחת וול סטריט. הנפח הגבוה ביותר, הסיגנלים הכי חזקים."
                    }
                ]
            }
        ],
        "checklist": [
            "בדוק מחיר: בין $1-$20?",
            "בדוק RVOL: מעל 5x?",
            "בדוק Float: מתחת ל-15M?",
            "בדוק שינוי יומי: מעל 10%?",
            "הגדר TP ו-SL לפני הכניסה",
            "בדוק שהשעה בחלון המועדף שלך",
            "לא יותר מ-2% מהחשבון בסיכון"
        ],
        "common_mistakes": [
            "כניסה מאוחרת מדי אחרי שהמניה כבר רצה 30%+",
            "ביטול ה-SL כי 'המניה תחזור'",
            "כניסה לעסקה שלא עומדת בכל הקריטריונים",
            "מסחר נקמה אחרי הפסד",
            "פוזיציה גדולה מדי ביחס לחשבון"
        ],
        "ai_insights": f"לפי {stats.get('days_tested', '?')} ימי נתוני Live Lab: החשבון שלך מראה ביצועים טובים ב-{best_hour} שעון ישראל — כנראה בגלל צירוף של נזילות טובה ואנרגיית מסחר. הטווח {best_price} הוכח כמנצח — בטווח הזה יש איזון בין נזילות לתנועתיות. המשך לבדוק עם הסורק ולאחר 90 יום תוכל לפנות לאסטרטגיה המדויקת הזו.",
        "strategy_id": "mock",
        "generated_at": date.today().isoformat(),
        "personal_stats": stats,
        "is_mock": True,
    }
