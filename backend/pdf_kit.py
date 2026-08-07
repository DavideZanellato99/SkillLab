"""Il vestito dei referti PDF: colori, caratteri e i mattoni con cui sono
impaginati la valutazione di una conversazione e l'esito di un test.

Sta fuori da exports.py perche' e' la traduzione su carta del design
dell'applicazione e non del contenuto dei due documenti: la palette sono i
token Tailwind della `index.css`, i caratteri sono gli stessi che il browser
carica (Outfit per i titoli, Inter per il testo) e vivono in `fonts/` perche'
il PDF nasce sul server, dove non c'e' nessun Google Fonts da interrogare.

I caratteri sono incorporati, quindi la pagina regge tutto l'unicode che
serve a un testo italiano, virgolette caporali comprese. Fuori dal sottoinsieme
imbarcato (l'alfabeto latino, la punteggiatura, le valute e i simboli) i glifi
non esistono e diventerebbero rettangoli vuoti: `safe()` li toglie, perche'
un commento di un LLM puo' contenere un'emoji e un referto non e' il posto
dove farla comparire come un quadratino.
"""

from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from pathlib import Path
from typing import Any, cast

from fpdf import FPDF
from fpdf.enums import MethodReturnValue, XPos, YPos
from fpdf.fonts import TTFFont
from fpdf.pattern import LinearGradient

FONTS_DIR = Path(__file__).parent / "fonts"

BODY_FONT = "inter"
HEAD_FONT = "outfit"

Rgb = tuple[int, int, int]

# ── Palette ───────────────────────────────────────────────────────────
# Gli stessi token dell'applicazione, letti su carta bianca invece che sul
# fondo notte: gli slate scendono di un paio di gradini per restare leggibili
# in stampa, il violetto e il ciano del gradiente sono identici.

WHITE: Rgb = (255, 255, 255)
INK: Rgb = (15, 23, 42)  # slate-900, i titoli
BODY: Rgb = (51, 65, 85)  # slate-700, il testo corrente
MUTED: Rgb = (100, 116, 139)  # slate-500, le etichette
FAINT: Rgb = (148, 163, 184)  # slate-400, il pie' di pagina
HAIRLINE: Rgb = (226, 232, 240)  # slate-200, i bordi
SURFACE: Rgb = (248, 250, 252)  # slate-50, il fondo dei riquadri
TRACK: Rgb = (241, 245, 249)  # slate-100, la pista delle barre

VIOLET: Rgb = (124, 58, 237)
VIOLET_DEEP: Rgb = (109, 40, 217)
VIOLET_TINT: Rgb = (245, 243, 255)
VIOLET_EDGE: Rgb = (221, 214, 254)
VIOLET_PALE: Rgb = (237, 233, 254)
CYAN: Rgb = (6, 182, 212)

GOOD: Rgb = (5, 150, 105)
GOOD_TINT: Rgb = (236, 253, 245)
GOOD_EDGE: Rgb = (167, 243, 208)
MID: Rgb = (234, 88, 12)
MID_TINT: Rgb = (255, 247, 237)
BAD: Rgb = (220, 38, 38)
BAD_TINT: Rgb = (254, 242, 242)
BAD_EDGE: Rgb = (254, 202, 202)

RADIUS = 2.6
CARD_PAD_X = 5.0
CARD_PAD_Y = 4.2
NOTE_PAD = 3.0
LABEL_H = 4.4  # l'altezza dell'etichetta che intitola un riquadrino
QUOTE_GAP = 2.0  # lo spazio fra due citazioni sotto la stessa etichetta


class Report(FPDF):
    """Un A4 gia' vestito: testata, pie' di pagina e i blocchi del referto.

    `title` e `subtitle` sono quello che la banda in gradiente scrive in
    copertina e quello che la striscia sottile ripete sulle pagine dopo,
    perche' un foglio staccato dalla pila deve dire da solo di cosa parla.
    """

    def __init__(self, *, title: str, subtitle: str) -> None:
        super().__init__(format="A4")
        self.doc_title = title
        self.doc_subtitle = subtitle
        self.set_margins(15, 15, 15)
        self.set_auto_page_break(True, margin=20)
        for style, file_name in (("", "Inter-Regular"), ("B", "Inter-Bold"), ("I", "Inter-Italic")):
            self.add_font(BODY_FONT, style, str(FONTS_DIR / f"{file_name}.ttf"))
        self.add_font(HEAD_FONT, "", str(FONTS_DIR / "Outfit-Bold.ttf"))
        self.set_font(BODY_FONT, "", 10)
        self._glyphs = frozenset(cast(TTFFont, self.fonts[BODY_FONT]).cmap) | {ord("\n")}
        self.alias_nb_pages()

    # ── Misure ────────────────────────────────────────────────────────

    @property
    def content_w(self) -> float:
        return self.w - self.l_margin - self.r_margin

    def fits(self, height: float) -> bool:
        """Se un blocco alto `height` sta ancora in questa pagina."""
        return self.get_y() + height <= self.page_break_trigger

    def keep_together(self, height: float) -> None:
        """Manda alla pagina dopo un blocco che qui non ci starebbe intero.

        Un blocco piu' alto della pagina resta dov'e': spostarlo non lo
        farebbe stare comunque, e lascerebbe solo mezzo foglio bianco.
        """
        usable = self.page_break_trigger - self.t_margin
        if height <= usable and not self.fits(height):
            self.add_page()

    def measure(self, text: str, width: float, line_h: float) -> float:
        """L'altezza che `text` occupera', col carattere impostato adesso."""
        return float(
            self.multi_cell(
                width,
                line_h,
                self.safe(text),
                dry_run=True,
                output=MethodReturnValue.HEIGHT,
            )
        )

    def safe(self, text: object) -> str:
        """Il testo senza i caratteri che il carattere incorporato non ha."""
        return "".join(char for char in str(text) if ord(char) in self._glyphs)

    def ellipsis(self, text: str, width: float) -> str:
        """Il testo accorciato a `width`, col carattere impostato adesso.

        Serve alle righe che stanno su una riga sola: un titolo lungo che
        deborda scriverebbe sopra la colonna accanto.
        """
        clean = self.safe(text)
        if self.get_string_width(clean) <= width:
            return clean
        while clean and self.get_string_width(clean + "…") > width:
            clean = clean[:-1]
        return clean.rstrip() + "…"

    def space(self, height: float = 4) -> None:
        self.set_y(self.get_y() + height)

    # ── Caratteri ─────────────────────────────────────────────────────

    def use(
        self,
        *,
        font: str = BODY_FONT,
        style: str = "",
        size: float = 9.5,
        color: Rgb = BODY,
    ) -> None:
        self.set_font(font, style, size)
        self.set_text_color(*color)

    def multi_cell(self, *args: Any, **kwargs: Any) -> Any:
        """Come quella di fpdf, ma allineata a sinistra invece che giustificata.

        A schermo nessun paragrafo dell'applicazione e' giustificato, e la
        giustificazione su colonne strette apre buchi bianchi fra le parole:
        il valore di serie di fpdf e' l'unico posto dove cambiarla una volta
        per tutti i blocchi del referto.
        """
        kwargs.setdefault("align", "L")
        return super().multi_cell(*args, **kwargs)

    def text_block(self, text: str, *, line_h: float = 4.8, width: float = 0) -> None:
        """Un paragrafo che va a capo da solo e lascia il cursore sotto."""
        self.multi_cell(
            width or self.content_w,
            line_h,
            self.safe(text),
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )

    # ── Testata e pie' di pagina ──────────────────────────────────────

    def header(self) -> None:
        if self.page_no() == 1:
            self._cover_band()
        else:
            self._running_band()

    def _cover_band(self) -> None:
        """La banda in gradiente, il gesto che l'applicazione fa dappertutto."""
        band_h = 36.0
        self.gradient(0, 0, self.w, band_h)
        self.set_xy(self.l_margin, 8.5)
        self.use(font=HEAD_FONT, size=11.5, color=WHITE)
        self.cell(self.content_w / 2, 6, "SkillLab")
        self.use(size=8.5, color=VIOLET_PALE)
        self.set_xy(self.l_margin + self.content_w / 2, 8.5)
        self.cell(self.content_w / 2, 6, self.safe(self.doc_subtitle), align="R")
        self.set_xy(self.l_margin, 19)
        self.use(font=HEAD_FONT, size=19, color=WHITE)
        self.cell(0, 10, self.safe(self.doc_title))
        self.set_y(band_h + 8)

    def _running_band(self) -> None:
        """Sulle pagine dopo la prima resta un filo di gradiente e il titolo."""
        self.gradient(0, 0, self.w, 2.6)
        self.set_xy(self.l_margin, 10)
        self.use(font=HEAD_FONT, size=8.5, color=VIOLET)
        title_w = self.get_string_width(self.doc_title) + 3
        self.cell(title_w, 5, self.safe(self.doc_title))
        self.use(size=8.5, color=FAINT)
        self.cell(self.content_w - title_w, 5, self.safe(self.doc_subtitle), align="R")
        self.set_y(22)

    def footer(self) -> None:
        self.set_y(-14)
        self.set_draw_color(*HAIRLINE)
        self.set_line_width(0.2)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.set_y(-11.5)
        self.use(font=HEAD_FONT, size=7.5, color=FAINT)
        self.cell(self.content_w / 2, 5, "SkillLab")
        self.use(size=7.5, color=FAINT)
        self.cell(self.content_w / 2, 5, f"{self.page_no()} / {{nb}}", align="R")

    # ── Primitive grafiche ────────────────────────────────────────────

    def gradient(self, x: float, y: float, width: float, height: float) -> None:
        """Il gradiente violetto-ciano dei pulsanti dell'applicazione."""
        stops = [_hex(VIOLET_DEEP), _hex(VIOLET), _hex(CYAN)]
        with self.use_pattern(LinearGradient(x, y, x + width, y, stops)):
            self.rect(x, y, width, height, style="F")

    def box(
        self,
        x: float,
        y: float,
        width: float,
        height: float,
        *,
        fill: Rgb,
        border: Rgb | None = None,
        radius: float = RADIUS,
    ) -> None:
        """Il rettangolo arrotondato da cui e' fatto tutto il resto.

        Dentro un contesto grafico suo, e non con `set_fill_color()` e via:
        in un PDF il colore del testo e quello dei riempimenti sono lo stesso
        operatore, quindi un riquadro disegnato "a mano" si ritrova addosso
        il colore dell'ultima riga scritta invece del proprio.
        """
        with self.local_context(fill_color=fill, draw_color=border or fill, line_width=0.25):
            self.rect(
                x,
                y,
                width,
                height,
                style="DF" if border else "F",
                round_corners=True,
                corner_radius=radius,
            )

    def pill(
        self,
        text: str,
        *,
        y: float,
        fg: Rgb,
        bg: Rgb,
        x: float | None = None,
        right: float | None = None,
        size: float = 8,
        style: str = "B",
    ) -> float:
        """Una targhetta arrotondata, come i chip a schermo. Torna la larghezza.

        Si posiziona dal bordo sinistro (`x`) o da quello destro (`right`),
        perche' quella appesa a destra di una scheda sa dove finisce ma non
        quanto e' larga finche' non si misura il testo.
        """
        self.use(size=size, style=style, color=fg)
        label = self.safe(text)
        width = self.get_string_width(label) + 5
        x = (right - width) if x is None and right is not None else (x or self.l_margin)
        height = size * 0.5 + 2.6
        self.box(x, y, width, height, fill=bg, radius=height / 2)
        self.use(size=size, style=style, color=fg)
        self.set_xy(x, y)
        self.cell(width, height, label, align="C")
        return width

    def bar(self, x: float, y: float, width: float, ratio: float, color: Rgb) -> None:
        """La barra del punteggio: pista chiara e riempimento del voto."""
        height = 2.0
        self.box(x, y, width, height, fill=TRACK, radius=height / 2)
        filled = width * max(0.0, min(1.0, ratio))
        if filled > 0.3:
            self.box(x, y, filled, height, fill=color, radius=height / 2)

    def section(self, label: str) -> None:
        """L'etichetta che apre una sezione, con la riga che la accompagna."""
        self.keep_together(24)
        top = self.get_y()
        self.use(font=HEAD_FONT, size=8.5, color=VIOLET)
        self.set_char_spacing(0.5)
        text = self.safe(label.upper())
        width = self.get_string_width(text) + 3.5
        self.cell(width, 5, text)
        self.set_char_spacing(0)
        self.set_draw_color(*HAIRLINE)
        self.set_line_width(0.2)
        self.line(self.l_margin + width, top + 2.6, self.w - self.r_margin, top + 2.6)
        self.set_y(top + 8)

    @contextmanager
    def card(
        self,
        height: float,
        *,
        fill: Rgb = WHITE,
        border: Rgb | None = HAIRLINE,
        accent: Rgb | None = None,
        width: float = 0,
        left: float | None = None,
        pad_x: float = CARD_PAD_X,
        pad_y: float = CARD_PAD_Y,
    ) -> Iterator[tuple[float, float, float]]:
        """Il riquadro arrotondato in cui sta un blocco del referto.

        L'altezza si sa prima perche' il fondo va disegnato sotto il testo, e
        in un PDF sotto vuol dire prima: chi chiama misura il contenuto con
        `measure()` e passa il totale. Restituisce l'angolo e la larghezza
        utili al contenuto, e alla fine lascia il cursore sotto al riquadro.

        Un contenuto piu' alto di una pagina intera (una risposta scritta puo'
        arrivare a cinquemila caratteri) esce senza riquadro, a tutta pagina:
        un rettangolo che sfonda il piede della pagina si porterebbe dietro il
        testo, e un referto illeggibile e' peggio di un referto senza cornice.
        """
        if height > self.page_break_trigger - self.t_margin:
            self.set_x(self.l_margin)
            yield self.l_margin, self.get_y(), self.content_w
            self.set_x(self.l_margin)
            return
        self.keep_together(height)
        top = self.get_y()
        left = self.l_margin if left is None else left
        box_w = width or self.content_w
        self.box(left, top, box_w, height, fill=fill, border=border)
        if accent:
            self.box(left + 1.1, top + 2.4, 1.3, max(height - 4.8, 1), fill=accent, radius=0.65)
        inner_x = left + pad_x + (1.6 if accent else 0)
        inner_w = box_w - 2 * pad_x - (1.6 if accent else 0)
        self.set_xy(inner_x, top + pad_y)
        yield inner_x, top + pad_y, inner_w
        self.set_xy(self.l_margin, top + height)

    def note_height(
        self,
        text: str | Sequence[str],
        width: float,
        *,
        label: str = "",
        size: float = 9,
        line_h: float = 4.5,
        italic: bool = False,
    ) -> float:
        """Quanto occupera' il riquadrino di `note()`, per chi misura prima."""
        parts = _parts(text)
        if len(parts) > 1:
            each = [
                self.note_height(part, width, size=size, line_h=line_h, italic=italic)
                for part in parts
            ]
            return sum(each) + QUOTE_GAP * (len(parts) - 1) + (LABEL_H + 1.5 if label else 0)
        self.use(size=size, style="I" if italic else "")
        height = self.measure(parts[0], width - 2 * NOTE_PAD, line_h)
        return height + (LABEL_H if label else 0) + 2 * NOTE_PAD

    def note(
        self,
        text: str | Sequence[str],
        *,
        x: float,
        width: float,
        fg: Rgb,
        bg: Rgb,
        label: str = "",
        size: float = 9,
        line_h: float = 4.5,
        italic: bool = False,
    ) -> None:
        """Il riquadrino colorato dentro una scheda: gli spunti, la risposta
        attesa, i passaggi del documento.

        Parte da dove sta il cursore e sotto lo lascia, come `card()` e per la
        stessa ragione: un testo troppo lungo per una pagina rinuncia allo
        sfondo invece di trascinarlo oltre il piede.

        Piu' testi sono piu' riquadri sotto un'etichetta sola: una domanda
        puo' fondarsi su due punti lontani del manuale, che restano due
        citazioni distinte, ma ripetere l'intestazione sopra ciascuna direbbe
        tre volte la stessa cosa. Ognuna e' una nota a se', quindi si porta
        dietro da sola il salto di pagina e la rinuncia allo sfondo.
        """
        parts = _parts(text)
        if len(parts) > 1:
            if label:
                self.set_xy(x, self.get_y())
                self._label(label, width=width, color=fg)
                self.space(1.5)
            for index, part in enumerate(parts):
                if index:
                    self.space(QUOTE_GAP)
                self.set_x(x)
                self.note(
                    part, x=x, width=width, fg=fg, bg=bg, size=size, line_h=line_h, italic=italic
                )
            return

        height = self.note_height(text, width, label=label, size=size, line_h=line_h, italic=italic)
        boxed = height <= self.page_break_trigger - self.t_margin
        if boxed:
            self.keep_together(height)
        top = self.get_y()
        inner_x, inner_w = (x + NOTE_PAD, width - 2 * NOTE_PAD) if boxed else (x, width)
        if boxed:
            self.box(x, top, width, height, fill=bg)
        self.set_xy(inner_x, top + (NOTE_PAD if boxed else 0))
        if label:
            self._label(label, width=inner_w, color=fg)
        self.use(size=size, style="I" if italic else "", color=fg)
        self.set_x(inner_x)
        self.multi_cell(inner_w, line_h, self.safe(parts[0]), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        if boxed:
            self.set_y(top + height)

    def _label(self, text: str, *, width: float, color: Rgb) -> None:
        """L'etichetta che intitola un riquadrino, e va a capo da sola."""
        left = self.get_x()
        self.use(font=HEAD_FONT, size=7.5, color=color)
        self.set_char_spacing(0.4)
        self.cell(width, LABEL_H, self.safe(text.upper()), new_x=XPos.LEFT, new_y=YPos.NEXT)
        self.set_char_spacing(0)
        self.set_x(left)

    def meta(self, rows: list[tuple[str, str]]) -> None:
        """I dati del referto su due colonne, dentro un riquadro tenue.

        Chi ha fatto cosa, con chi e quando: e' la parte che si legge in
        diagonale, quindi sta compatta invece di occupare mezza pagina. Un
        valore troppo lungo per mezza riga se la prende tutta, cosi' il
        titolo di una conversazione non finisce sopra la colonna accanto.
        """
        pairs = [(label, value) for label, value in rows if value]
        full_w = self.content_w - 2 * CARD_PAD_X
        column_w = full_w / 2
        line_h = 5.6
        placed: list[tuple[str, str, int, int, float]] = []
        row = column = 0
        for label, value in pairs:
            self.use(size=8.5)
            label_w = self.get_string_width(label) + 3
            self.use(size=9, style="B")
            if label_w + self.get_string_width(value) > column_w - 3:
                if column:
                    row, column = row + 1, 0
                placed.append((label, value, row, 0, full_w))
                row += 1
            else:
                placed.append((label, value, row, column, column_w))
                column += 1
                if column == 2:
                    row, column = row + 1, 0
        height = (row + (1 if column else 0)) * line_h + 2 * CARD_PAD_Y
        with self.card(height, fill=SURFACE) as (x, y, _):
            for label, value, at_row, at_column, width in placed:
                self.set_xy(x + at_column * column_w, y + at_row * line_h)
                self.use(size=8.5, color=MUTED)
                label_w = self.get_string_width(label) + 3
                self.cell(label_w, line_h, self.safe(label))
                self.use(size=9, style="B", color=INK)
                self.cell(width - label_w, line_h, self.ellipsis(value, width - label_w))


def _parts(text: str | Sequence[str]) -> list[str]:
    """I testi di una nota: uno solo o una citazione per elemento."""
    if isinstance(text, str):
        return [text]
    return [part for part in text if str(part).strip()] or [""]


def _hex(color: Rgb) -> str:
    red, green, blue = color
    return f"#{red:02X}{green:02X}{blue:02X}"


def tinted(color: Rgb) -> Rgb:
    """Il fondo tenue di un colore, quello che a schermo e' `/10` di opacita'."""
    return tuple(round(255 - (255 - channel) * 0.09) for channel in color)  # type: ignore[return-value]
