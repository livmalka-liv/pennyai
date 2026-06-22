"""
Performance report emails via SMTP (Gmail or any provider).

Required env vars:
    SMTP_HOST      e.g. smtp.gmail.com
    SMTP_PORT      e.g. 587
    SMTP_USER      sender email address
    SMTP_PASS      Gmail App Password (not the regular password)
    REPORT_EMAIL   recipient (defaults to SMTP_USER)
"""

import smtplib
import logging
from collections import defaultdict
from datetime import date, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy.orm import Session

from app.models.db_models import PaperTrade

logger = logging.getLogger(__name__)


# ─── Data ────────────────────────────────────────────────────────────────────

def _build_report_data(db: Session) -> dict:
    today_str       = date.today().isoformat()
    week_start_str  = (date.today() - timedelta(days=date.today().weekday())).isoformat()
    month_start_str = date.today().replace(day=1).isoformat()

    rows = (
        db.query(PaperTrade)
        .filter(
            PaperTrade.status.in_(["win", "loss", "flat"]),
            PaperTrade.trade_date >= month_start_str,
        )
        .all()
    )

    by_strategy: dict[str, list] = defaultdict(list)
    for t in rows:
        by_strategy[t.strategy_name].append(t)

    def _agg(trades):
        rets = [t.return_pct for t in trades if t.return_pct is not None]
        wins = sum(1 for t in trades if t.status == "win")
        return {
            "trades":   len(trades),
            "wins":     wins,
            "win_rate": round(wins / len(trades) * 100, 1) if trades else 0,
            "pct":      round(sum(rets), 2) if rets else 0.0,
        }

    strategies = []
    for name, trades in by_strategy.items():
        today_t = [t for t in trades if t.trade_date == today_str]
        week_t  = [t for t in trades if t.trade_date >= week_start_str]
        strategies.append({
            "name":   name,
            "today":  _agg(today_t),
            "week":   _agg(week_t),
            "month":  _agg(trades),
        })

    strategies.sort(key=lambda x: x["month"]["pct"], reverse=True)
    return {"date": today_str, "strategies": strategies}


# ─── HTML template ────────────────────────────────────────────────────────────

def _pct_cell(pct: float) -> str:
    color = "#10b981" if pct >= 0 else "#ef4444"
    sign  = "+" if pct >= 0 else ""
    return f'<td style="text-align:center;color:{color};font-weight:600">{sign}{pct}%</td>'


def _build_html(data: dict, period: str) -> str:
    period_labels = {"daily": "יומי", "weekly": "שבועי", "monthly": "חודשי"}
    period_he = period_labels.get(period, "יומי")
    today = data["date"]
    strategies = data["strategies"]

    rows_html = ""
    for s in strategies:
        m = s["month"]
        w = s["week"]
        t = s["today"]
        rows_html += f"""
        <tr style="border-bottom:1px solid #1e293b">
          <td style="padding:10px 14px;color:#f8fafc;font-weight:600">{s['name']}</td>
          {_pct_cell(t['pct'])}
          <td style="text-align:center;color:#64748b;font-size:12px">{t['trades']} ✦ {t['win_rate']}%</td>
          {_pct_cell(w['pct'])}
          <td style="text-align:center;color:#64748b;font-size:12px">{w['trades']} ✦ {w['win_rate']}%</td>
          {_pct_cell(m['pct'])}
          <td style="text-align:center;color:#64748b;font-size:12px">{m['trades']} ✦ {m['win_rate']}%</td>
        </tr>"""

    if not rows_html:
        rows_html = '<tr><td colspan="7" style="padding:20px;text-align:center;color:#64748b">אין נתונים עדיין — הפעל אסטרטגיות מ-Strategy Lab</td></tr>'

    total_today = sum(s["today"]["pct"] for s in strategies)
    total_week  = sum(s["week"]["pct"]  for s in strategies)
    total_month = sum(s["month"]["pct"] for s in strategies)

    def _summary_box(label, value, trades):
        color = "#10b981" if value >= 0 else "#ef4444"
        sign  = "+" if value >= 0 else ""
        return f"""
        <div style="background:#0d1117;border:1px solid #1e293b;border-radius:12px;padding:16px 20px;text-align:center;min-width:120px">
          <div style="color:#64748b;font-size:12px;margin-bottom:4px">{label}</div>
          <div style="color:{color};font-size:22px;font-weight:700">{sign}{round(value,1)}%</div>
          <div style="color:#475569;font-size:11px">{trades} עסקאות</div>
        </div>"""

    total_today_trades = sum(s["today"]["trades"] for s in strategies)
    total_week_trades  = sum(s["week"]["trades"]  for s in strategies)
    total_month_trades = sum(s["month"]["trades"] for s in strategies)

    return f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#080b10;font-family:system-ui,-apple-system,sans-serif;color:#f8fafc">
  <div style="max-width:680px;margin:0 auto;padding:32px 16px">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px">
      <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:20px;font-weight:800">Penny<span style="color:#6366f1">AI</span></span>
      </div>
      <h1 style="margin:0;font-size:22px;font-weight:700">דוח ביצועים {period_he}</h1>
      <p style="color:#64748b;font-size:14px;margin-top:6px">{today}</p>
    </div>

    <!-- Summary boxes -->
    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:28px">
      {_summary_box("היום", total_today, total_today_trades)}
      {_summary_box("השבוע", total_week, total_week_trades)}
      {_summary_box("החודש", total_month, total_month_trades)}
    </div>

    <!-- Table -->
    <div style="background:#0d1117;border:1px solid #1e293b;border-radius:16px;overflow:hidden;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#131a26;color:#64748b;font-size:11px">
            <th style="padding:10px 14px;text-align:right;font-weight:500">אסטרטגיה</th>
            <th style="padding:10px 8px;text-align:center;font-weight:500" colspan="2">היום</th>
            <th style="padding:10px 8px;text-align:center;font-weight:500" colspan="2">שבוע</th>
            <th style="padding:10px 8px;text-align:center;font-weight:500" colspan="2">חודש</th>
          </tr>
        </thead>
        <tbody>{rows_html}</tbody>
      </table>
    </div>

    <!-- Footer -->
    <p style="text-align:center;color:#475569;font-size:12px;margin-top:24px">
      PennyAI — סימולציה בלבד, לא ייעוץ השקעות<br>
      <a href="https://frontend-three-jade-63.vercel.app/signals" style="color:#6366f1;text-decoration:none">צפה באותות &rarr;</a>
    </p>
  </div>
</body>
</html>"""


# ─── Send ─────────────────────────────────────────────────────────────────────

def _subject(period: str) -> str:
    labels = {"daily": "יומי", "weekly": "שבועי", "monthly": "חודשי"}
    return f"📈 PennyAI — דוח ביצועים {labels.get(period, '')} | {date.today().isoformat()}"


def send_report(db: Session, period: str, settings) -> bool:
    """
    Build and send a performance report email.
    settings must have: smtp_host, smtp_port, smtp_user, smtp_pass, report_email
    Returns True on success.
    """
    if not all([settings.smtp_host, settings.smtp_user, settings.smtp_pass]):
        logger.warning("send_report: SMTP not configured — skipping")
        return False

    to_email = settings.report_email or settings.smtp_user

    try:
        data = _build_report_data(db)
        html = _build_html(data, period)

        msg = MIMEMultipart("alternative")
        msg["Subject"] = _subject(period)
        msg["From"]    = settings.smtp_user
        msg["To"]      = to_email
        msg.attach(MIMEText(html, "html", "utf-8"))

        with smtplib.SMTP(settings.smtp_host, int(settings.smtp_port or 587)) as srv:
            srv.ehlo()
            srv.starttls()
            srv.login(settings.smtp_user, settings.smtp_pass)
            srv.sendmail(settings.smtp_user, to_email, msg.as_string())

        logger.info(f"Performance report ({period}) sent to {to_email}")
        return True
    except Exception as exc:
        logger.error(f"send_report failed ({period}): {exc}")
        return False
