"""File exports: the PDF of a single evaluation and the Excel of the
evaluations report.

Pure builders: plain data in, file bytes out. No DB and no FastAPI here,
so both are unit-testable and the endpoints stay thin.

The PDF uses the core Helvetica font, which is latin-1 only: everything
that reaches a page goes through _latin(), because the evaluation text
comes from an LLM and can carry typographic quotes and other characters
outside latin-1 that would otherwise raise at render time.
"""

from datetime import datetime
from io import BytesIO

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from openai_service import EVALUATION_CRITERIA
from schemas import EvaluationReportRow, PreviousAttempt

# Compact criterion names for the spreadsheet header (the full labels are
# sentences); keys are the ones of openai_service.EVALUATION_CRITERIA and
# the names mirror the dashboard table.
CRITERION_SHORT_LABELS = {
    "rispetto_fasi_chiamata": "Fasi",
    "empatia": "Empatia",
    "sicurezza_competenza": "Sicurezza",
    "appropriatezza_linguaggio": "Linguaggio",
    "identificazione_cliente": "Identificazione",
    "comprensione_casistica": "Casistica",
}

MODE_LABELS = {"voice": "Chiamata", "text": "Chat"}

# Print-friendly variants of the app's score colors (emerald/orange/red)
_SCORE_GOOD = (5, 150, 105)
_SCORE_MID = (234, 88, 12)
_SCORE_BAD = (220, 38, 38)
_SLATE = (71, 85, 105)
_LIGHT = (100, 116, 139)
_VIOLET = (109, 40, 217)


def _score_rgb(score: float) -> tuple[int, int, int]:
    if score >= 7:
        return _SCORE_GOOD
    if score >= 5:
        return _SCORE_MID
    return _SCORE_BAD


def _score_hex(score: float) -> str:
    red, green, blue = _score_rgb(score)
    return f"{red:02X}{green:02X}{blue:02X}"


def _latin(text: object) -> str:
    """Best-effort projection onto latin-1, the charset of the core fonts."""
    return str(text).encode("latin-1", "replace").decode("latin-1")


def _fmt_score(score: float) -> str:
    return f"{score:.1f}".replace(".", ",")


def _fmt_date(value: datetime) -> str:
    return value.strftime("%d/%m/%Y %H:%M")


# ── PDF of a single evaluation ────────────────────────


def evaluation_pdf(
    *,
    operator_name: str,
    avatar_name: str,
    conversation_title: str,
    mode: str,
    conversation_at: datetime,
    evaluated_at: datetime,
    overall_score: float,
    summary: str,
    criteria: list[dict],
    previous: PreviousAttempt | None,
) -> bytes:
    """One evaluation as an A4 PDF the operator can hand to the trainer.

    `criteria` is the stored result shape (key, label, weight, score,
    comment, suggestions); `previous` adds the per-criterion comparison
    with the previous attempt when there is one.
    """
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()
    page_w = pdf.w - pdf.l_margin - pdf.r_margin

    def line(height: float = 4) -> None:
        pdf.set_y(pdf.get_y() + height)

    # Header
    pdf.set_font("helvetica", "B", 17)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 9, "Valutazione della conversazione", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("helvetica", "", 9)
    pdf.set_text_color(*_LIGHT)
    pdf.cell(0, 5, "SkillLab - training con avatar", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    line(4)

    # Context block: who, with whom, on which channel and when
    rows = [
        ("Operatore", operator_name),
        ("Avatar", avatar_name),
        ("Conversazione", conversation_title),
        ("Canale", MODE_LABELS.get(mode, mode)),
        ("Data conversazione", _fmt_date(conversation_at)),
        ("Valutazione generata il", _fmt_date(evaluated_at)),
    ]
    for label, value in rows:
        pdf.set_font("helvetica", "", 9.5)
        pdf.set_text_color(*_LIGHT)
        pdf.cell(44, 5.4, _latin(label))
        pdf.set_font("helvetica", "B", 9.5)
        pdf.set_text_color(*_SLATE)
        pdf.cell(0, 5.4, _latin(value), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    line(5)

    # Overall score
    pdf.set_font("helvetica", "", 9)
    pdf.set_text_color(*_LIGHT)
    pdf.cell(0, 5, "PUNTEGGIO COMPLESSIVO", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("helvetica", "B", 24)
    pdf.set_text_color(*_score_rgb(overall_score))
    pdf.cell(
        0, 11, _latin(f"{_fmt_score(overall_score)} / 10"), new_x=XPos.LMARGIN, new_y=YPos.NEXT
    )
    if previous:
        delta = round(overall_score - previous.overall_score, 1)
        sign = "+" if delta > 0 else ""
        pdf.set_font("helvetica", "", 9)
        pdf.set_text_color(*_LIGHT)
        pdf.cell(
            0,
            5,
            _latin(
                f"Rispetto al tentativo precedente «{previous.title}» del "
                f"{_fmt_date(previous.conversation_at)}: {sign}{_fmt_score(delta)} "
                f"(era {_fmt_score(previous.overall_score)})"
            ),
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
    if summary:
        line(2)
        pdf.set_font("helvetica", "", 10)
        pdf.set_text_color(*_SLATE)
        pdf.multi_cell(0, 5, _latin(summary), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    line(5)

    # Criteria
    for criterion in criteria:
        score = float(criterion.get("score", 0) or 0)
        pdf.set_font("helvetica", "B", 11)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(page_w - 26, 6.5, _latin(criterion.get("label", criterion.get("key", ""))))
        pdf.set_text_color(*_score_rgb(score))
        pdf.cell(
            26,
            6.5,
            _latin(f"{_fmt_score(score)} / 10"),
            align="R",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )

        # Score bar
        bar_y = pdf.get_y() + 1
        pdf.set_fill_color(226, 232, 240)
        pdf.rect(pdf.l_margin, bar_y, page_w, 1.6, "F")
        pdf.set_fill_color(*_score_rgb(score))
        pdf.rect(pdf.l_margin, bar_y, page_w * max(0.0, min(1.0, score / 10)), 1.6, "F")
        pdf.set_y(bar_y + 3.6)

        # Weight and, when available, the previous attempt's score
        sub = f"Peso {criterion.get('weight', '')}%"
        if previous:
            prev_score = previous.criteria_scores.get(str(criterion.get("key", "")))
            if prev_score is not None:
                delta = round(score - prev_score, 1)
                sign = "+" if delta > 0 else ""
                sub += (
                    f" - tentativo precedente {_fmt_score(prev_score)} ({sign}{_fmt_score(delta)})"
                )
        pdf.set_font("helvetica", "", 8.5)
        pdf.set_text_color(*_LIGHT)
        pdf.cell(0, 4.5, _latin(sub), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        comment = str(criterion.get("comment") or "").strip()
        if comment:
            pdf.set_font("helvetica", "", 9.5)
            pdf.set_text_color(*_SLATE)
            pdf.multi_cell(0, 4.8, _latin(comment), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        suggestions = str(criterion.get("suggestions") or "").strip()
        if suggestions:
            line(1.5)
            pdf.set_font("helvetica", "", 9.5)
            pdf.set_text_color(*_VIOLET)
            pdf.set_fill_color(243, 240, 255)
            pdf.multi_cell(
                0,
                4.8,
                _latin(f"Spunti di miglioramento: {suggestions}"),
                fill=True,
                new_x=XPos.LMARGIN,
                new_y=YPos.NEXT,
            )
        line(5)

    return bytes(pdf.output())


# ── Excel of the evaluations report ───────────────────


def evaluations_report_xlsx(rows: list[EvaluationReportRow]) -> bytes:
    """The evaluations report as a formatted .xlsx (one row per evaluation).

    Styled header, frozen first row, autofilter, date and score formats and
    threshold colors, so the file is ready to read or slice in Excel with
    no cleanup. Rows come out newest first.
    """
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Valutazioni"

    criterion_keys = [key for key, _, _ in EVALUATION_CRITERIA]
    headers = (
        ["Data", "Conversazione", "Canale", "Operatore", "Email", "Organizzazione", "Avatar"]
        + [CRITERION_SHORT_LABELS.get(key, key) for key in criterion_keys]
        + ["Voto", "Valutata il"]
    )
    widths = [16, 30, 11, 22, 30, 20, 20] + [13] * len(criterion_keys) + [8, 16]

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="7C3AED")
    for col, (title, width) in enumerate(zip(headers, widths, strict=True), start=1):
        cell = sheet.cell(row=1, column=col, value=title)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        sheet.column_dimensions[get_column_letter(col)].width = width
    sheet.row_dimensions[1].height = 22

    for row_idx, row in enumerate(
        sorted(rows, key=lambda r: r.conversation_at, reverse=True), start=2
    ):
        scores = {c.key: c.score for c in row.criteria}
        operator = f"{row.user_nome} {row.user_cognome}".strip() or row.user_email

        sheet.cell(row=row_idx, column=1, value=row.conversation_at.replace(tzinfo=None))
        sheet.cell(row=row_idx, column=2, value=row.conversation_title)
        sheet.cell(row=row_idx, column=3, value=MODE_LABELS.get(row.mode, row.mode))
        sheet.cell(row=row_idx, column=4, value=operator)
        sheet.cell(row=row_idx, column=5, value=row.user_email)
        sheet.cell(row=row_idx, column=6, value=row.organization_name or "")
        sheet.cell(row=row_idx, column=7, value=row.avatar_name)
        for offset, key in enumerate(criterion_keys):
            score = scores.get(key)
            if score is None:
                continue
            cell = sheet.cell(row=row_idx, column=8 + offset, value=score)
            cell.font = Font(color=_score_hex(score))
        overall = sheet.cell(row=row_idx, column=8 + len(criterion_keys), value=row.overall_score)
        overall.font = Font(bold=True, color=_score_hex(row.overall_score))
        sheet.cell(
            row=row_idx,
            column=9 + len(criterion_keys),
            value=row.evaluated_at.replace(tzinfo=None),
        )

    date_format = "dd/mm/yyyy hh:mm"
    last_col = len(headers)
    for row_cells in sheet.iter_rows(min_row=2, max_row=max(2, len(rows) + 1)):
        row_cells[0].number_format = date_format
        row_cells[last_col - 1].number_format = date_format
        for cell in row_cells[7 : 7 + len(criterion_keys) + 1]:
            cell.number_format = "0.0"
            cell.alignment = Alignment(horizontal="center")

    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = f"A1:{get_column_letter(last_col)}{max(2, len(rows) + 1)}"

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
