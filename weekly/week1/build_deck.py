# 사용: python3 build_deck.py <템플릿.pptx> <출력.pptx> <이미지 폴더>
# 이미지 폴더: arch-crop.png(아키텍처 그림에서 제목·범례를 잘라낸 것), router.png, stopwatch.png
# 템플릿: docs/reference/templates/랩미팅_261014.pptx (저장소에 없음). 규칙은 메모리의 발표자료 규칙과 docs/DESIGN.md §6
# 1주차 발표자료 생성: 템플릿(랩미팅_261014.pptx)의 표지 + 본문 레이아웃 사용
import copy, sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

TPL, OUT, IMG = sys.argv[1], sys.argv[2], sys.argv[3]
prs = Presentation(TPL)

# 템플릿 본문 슬라이드의 쪽 번호 개체를 복사해 둔다 (add_slide는 쪽 번호를 복제하지 않음)
sldnum_xml = None
for sh in prs.slides[2].shapes:
    if sh.is_placeholder and sh.placeholder_format.type == 13:
        sldnum_xml = copy.deepcopy(sh._element)

# 표지(1장)만 남기고 삭제
sldIdLst = prs.slides._sldIdLst
for sldId in list(sldIdLst)[1:]:
    prs.part.drop_rel(sldId.rId)
    sldIdLst.remove(sldId)

LAYOUT = prs.slide_layouts[11]  # 1_사용자 지정 레이아웃
INK = RGBColor(0x21, 0x25, 0x29)
MUTED = RGBColor(0x49, 0x50, 0x57)
ACCENT = INK  # 결론은 색 없이 굵게 (docs/DESIGN.md §5)


def set_notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def new_slide(title):
    s = prs.slides.add_slide(LAYOUT)
    for ph in list(s.placeholders):
        if ph.placeholder_format.idx == 1:  # 내용 개체 틀은 쓰지 않음
            ph._element.getparent().remove(ph._element)
    s.shapes.title.text = title
    r = s.shapes.title.text_frame.paragraphs[0].runs[0]
    r.font.size = Pt(24)
    r.font.bold = True
    if sldnum_xml is not None:
        s.shapes._spTree.append(copy.deepcopy(sldnum_xml))
    return s


def text(slide, x, y, w, h, paras, size=16, color=INK, bold=False, bullet=False, anchor=None, name=None):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    if name:
        tb.name = name
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = Inches(0.05)
    if anchor:
        tf.vertical_anchor = anchor
    for i, p in enumerate(paras):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        runs = p if isinstance(p, list) else [(p, {})]
        for t, opt in runs:
            r = para.add_run()
            r.text = t
            r.font.size = Pt(opt.get('size', size))
            r.font.bold = opt.get('bold', bold)
            r.font.color.rgb = opt.get('color', color)
        if bullet:
            pPr = para._p.get_or_add_pPr()
            pPr.set('marL', str(Inches(0.25)))
            pPr.set('indent', str(-Inches(0.25)))
            bu = pPr.makeelement(qn('a:buChar'), {'char': '•'})
            pPr.append(bu)
        para.space_after = Pt(6)
    return tb


def conclusion(slide, x, y, w, msg):
    return text(slide, x, y, w, 0.42, [[(msg, {'bold': True, 'color': ACCENT})]], size=16, name='결론')


def table(slide, x, y, w, col_w, rows, size=14, row_h=0.42, align=None):
    shp = slide.shapes.add_table(len(rows), len(rows[0]), Inches(x), Inches(y), Inches(w), Inches(row_h * len(rows)))
    tbl = shp.table
    for j, cw in enumerate(col_w):
        tbl.columns[j].width = Inches(cw)
    for i, row in enumerate(rows):
        for j, val in enumerate(row):
            c = tbl.cell(i, j)
            c.text = ''
            p = c.text_frame.paragraphs[0]
            r = p.add_run()
            r.text = val
            r.font.size = Pt(size)
            r.font.bold = (i == 0)
            r.font.color.rgb = INK
            a = (align[j] if align else ('L' if j == 0 else 'C'))
            p.alignment = PP_ALIGN.CENTER if (i == 0 or a == 'C') else PP_ALIGN.LEFT
            c.vertical_anchor = MSO_ANCHOR.MIDDLE
            c.fill.solid()
            c.fill.fore_color.rgb = RGBColor(0xF1, 0xF3, 0xF5) if i == 0 else RGBColor(0xFF, 0xFF, 0xFF)
    # 템플릿 표와 같은 회색 테두리
    tblPr = tbl._tbl.tblPr
    tblPr.set('firstRow', '1')
    tblPr.set('bandRow', '0')
    style = tblPr.find(qn('a:tableStyleId'))
    if style is not None:
        style.text = '{5940675A-B579-460E-94D1-54222C63F5DA}'  # 스타일 없음, 표 눈금
    else:
        st = tblPr.makeelement(qn('a:tableStyleId'), {})
        st.text = '{5940675A-B579-460E-94D1-54222C63F5DA}'
        tblPr.append(st)
    return shp


# ---------- 1. 표지 ----------
cover = prs.slides[0]
for sh in cover.shapes:
    if sh.name == '제목 1':
        runs = sh.text_frame.paragraphs[0].runs  # 16pt 부제 run 4개 + <a:br> + 28pt 제목 run
        runs[0].text = 'PBL Project 2 (인공지능프로젝트) 1주차 진행 점검'
        for r in runs[1:4]:
            r.text = ''
        runs[4].text = 'WebRTC 기반 실시간 원격 현장 지원 시스템'
    elif sh.name == '부제목 2':
        sh.text_frame.paragraphs[0].runs[0].text = '2026.11.09'
        for r in sh.text_frame.paragraphs[0].runs[1:]:
            r.text = ''
set_notes(cover, '1주차 진행 점검을 시작하겠습니다. 웹 브라우저만으로 현장 작업자와 원격 전문가를 실시간으로 연결하는 시스템입니다. '
          '시스템 구조, 이번 주에 실제로 연결한 결과, 가장 어렵다고 예상하는 문제, 남은 계획 순서로 말씀드리겠습니다.')

# ---------- 2. 시스템 구조 ----------
s = new_slide('[시스템 구조] 영상은 서버를 거치지 않고 직접 간다')
s.shapes.add_picture(f'{IMG}/arch-crop.png', Inches(0.55), Inches(1.25), width=Inches(9.45))
text(s, 10.15, 1.25, 2.8, 4.3, [
    [('용어', {'bold': True})],
    [('NAT', {'bold': True}), (': 공유기가 집 안의 사설 주소를 인터넷 공인 주소로 바꿔 주는 장치', {})],
    [('P2P', {'bold': True}), (': 브라우저끼리 서버 없이 직접 연결', {})],
    [('STUN', {'bold': True}), (': NAT 바깥에서 보이는 내 주소를 알려 주는 공용 서버', {})],
    [('TURN', {'bold': True}), (': 직접 연결이 막힐 때 영상을 대신 전달하는 서버 (이번 범위는 필요할 때만)', {})],
    [('ngrok', {'bold': True}), (': 내 PC의 서버를 인터넷 주소로 공개하는 도구', {})],
], size=14, color=MUTED)
conclusion(s, 0.9, 5.45, 11.6, '서버는 연결 정보만 중계해서 가볍다. 대신 연결이 되느냐는 NAT를 통과하느냐에 달려 있다')
text(s, 3.6, 5.95, 9.0, 0.35, ['※ 각 장 아래쪽 굵은 글씨 = 그 장의 결론'], size=12, color=MUTED)
set_notes(s, '전체 구조입니다. 현장 작업자는 스마트폰 브라우저, 전문가는 PC 브라우저를 씁니다. 앱 설치는 없습니다.\n'
          '처음 만나는 두 브라우저는 서로의 주소를 모르기 때문에, 가운데 시그널링 서버가 연결 정보만 전달해 줍니다. 검은 점선입니다.\n'
          '각 브라우저는 STUN 서버에 물어서 공유기 바깥에서 보이는 자기 주소를 알아냅니다. 회색 점선입니다.\n'
          '그다음 영상, 음성, 채팅과 포인터 같은 데이터는 가운데 굵은 초록 선처럼 서버를 거치지 않고 브라우저끼리 직접 주고받습니다.\n'
          '그래서 서버는 가볍지만, 두 단말이 서로 다른 공유기 뒤에 있으면 직접 연결이 막힐 수 있습니다. 그때는 아래쪽 노란 점선처럼 TURN 서버가 영상을 대신 전달해야 합니다.\n'
          '개발용 서버는 제 노트북에서 돌리고, ngrok으로 인터넷 주소를 붙여서 LTE에 있는 폰도 접속할 수 있게 했습니다.')

# ---------- 3. 연결 구현 결과 ----------
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
s = new_slide('[연결 구현] iPhone·iPad와 PC 직접 연결 성공')
table(s, 0.9, 1.3, 6.3, [3.1, 1.6, 1.6], [
    ['지표', 'iPhone', 'iPad'],
    ['연결 성공 ↑', '9 / 9', '10 / 10'],
    ['연결 시간 ↓', '50.5 ms', '46 ms'],
    ['왕복 지연(RTT) ↓', '9 ms', '9 ms'],
    ['데이터 통로 왕복 ↓', '21.8 ms', '39.3 ms'],
    ['연결 경로', '직접 (P2P)', '직접 (P2P)'],
], size=14)
text(s, 0.9, 3.9, 6.3, 0.35, ['시간은 중앙값. 연결 시간 = PC가 입장 요청을 보낸 뒤 연결 완료까지'], size=12, color=MUTED)
cd = CategoryChartData()
cd.categories = [str(i) for i in range(2, 11)]
cd.add_series('iPhone', [73, 40, 44, 47, 54, 45, 102, 66, None])
cd.add_series('iPad', [172, 42, 41, 126, 44, 46, 88, 46, 39])
gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(7.5), Inches(1.25), Inches(5.0), Inches(2.95), cd)
ch = gf.chart
ch.has_title = True
ch.chart_title.text_frame.text = '회차별 연결 시간 (ms, 작을수록 좋음)'
ch.chart_title.text_frame.paragraphs[0].runs[0].font.size = Pt(14)
ch.chart_title.text_frame.paragraphs[0].runs[0].font.bold = True
ch.has_legend = True
ch.legend.position = XL_LEGEND_POSITION.BOTTOM
ch.legend.include_in_layout = False
ch.legend.font.size = Pt(12)
ch.category_axis.tick_labels.font.size = Pt(12)
ch.value_axis.tick_labels.font.size = Pt(12)
ch.value_axis.has_major_gridlines = True
ch.value_axis.major_gridlines.format.line.color.rgb = RGBColor(0xDE, 0xE2, 0xE6)
ch.category_axis.has_title = True
ch.category_axis.axis_title.text_frame.text = '회차 (PC가 나중에 입장한 2~10회차)'
ch.category_axis.axis_title.text_frame.paragraphs[0].runs[0].font.size = Pt(12)
for ser, col in zip(ch.series, [RGBColor(0x22, 0x27, 0x2B), RGBColor(0xA9, 0xB3, 0xBC)]):
    ser.format.fill.solid(); ser.format.fill.fore_color.rgb = col
text(s, 0.9, 4.2, 11.6, 1.2, [
    '조건: 같은 공유기 Wi-Fi, PC(MacBook Air, Chrome 자동 실행)가 10회 입장과 퇴장, 영상과 음성 없이 데이터 통로만 연결, 공용 STUN',
    '한계: Wi-Fi 1곳에서 1회 시험했다. iPhone 10회째는 시험 중 앱 전환으로 중단돼 실패에서 뺐다. iPhone을 http로 열면 카메라 기능이 막혀 카메라 시험은 https가 필요하다',
], size=16, bullet=True)
conclusion(s, 0.9, 5.55, 11.6, '실제 기기에서도 서버를 거치지 않고 0.1초 안팎에 직접 연결된다')
set_notes(s, '이번 주에 시그널링 서버와 연결 코드를 만들고, 실제 아이폰과 아이패드를 PC와 같은 와이파이에서 연결해 봤습니다.\n'
          '기기는 현장 쪽 화면에 머물러 있고, PC 쪽 크롬이 자동으로 열 번 들어갔다 나오면서 매번 연결 시간을 쟀습니다.\n'
          '아이폰은 아홉 번 모두, 아이패드는 열 번 모두 서버를 거치지 않는 직접 연결로 붙었습니다. 연결 시간 중앙값은 아이폰 50.5밀리초, 아이패드 46밀리초입니다. 오른쪽 그래프처럼 대부분 0.1초 안쪽이고, 가끔 0.1초를 넘는 회차가 있습니다.\n'
          '아이폰 열 번째는 제가 시험 중에 화면 캡처하려고 앱을 바꾸는 바람에 페이지가 멈춘 것이라 실패에서 뺐습니다. 서버 기록으로 확인했습니다.\n'
          '그리고 아이폰에서 http 주소로 열면 카메라 기능 자체가 막혀서, 카메라를 쓰는 시험은 https 주소로 해야 합니다.\n'
          '아직 영상과 음성 없이 데이터 통로만 연결한 결과이고, 와이파이 한 곳에서 한 번 시험한 값입니다.')

# ---------- 4. 예상 난제 ----------
s = new_slide('[예상 난제] 다른 네트워크에서도 직접 연결이 될까')
cards = [
    (0.9, 'router.png', '① 다른 네트워크 사이의 직접 연결', [
        '폰(LTE)과 PC(다른 Wi-Fi)는 각자 NAT 뒤에 있어 사설 주소로는 서로 연결할 수 없다',
        'STUN으로 공인 주소를 알아내도 NAT가 상대마다 다른 주소를 쓰거나(대칭형 NAT) UDP를 막으면 실패할 수 있다',
        '실패하면 TURN 서버가 영상을 중계해야 하고, 그만큼 서버 대역폭과 비용이 든다',
        '관찰: 같은 Wi-Fi 시험 19회 중 14회는 연결 시점에 STUN 공인 주소 후보가 아직 없었다',
    ]),
    (6.85, 'stopwatch.png', '② 사람이 느끼는 지연 재기', [
        '브라우저가 알려 주는 왕복 지연(RTT)은 네트워크 구간만 보여 준다',
        '실제 지연 = 카메라 촬영 + 압축 + 전송 + 수신 대기 + 화면 표시',
        '카메라 렌즈에서 상대 화면까지의 전체 지연을 ms 단위로 재는 도구가 따로 필요하다',
        '이것을 Glass-to-Glass 지연이라 한다',
    ]),
]
for x, icon, head, body in cards:
    s.shapes.add_picture(f'{IMG}/{icon}', Inches(x + 0.25), Inches(1.45), width=Inches(0.7))
    text(s, x + 1.05, 1.55, 4.4, 0.5, [[(head, {'bold': True})]], size=18)
    text(s, x + 0.25, 2.3, 5.15, 3.0, body, size=16, bullet=True)
conclusion(s, 0.9, 5.55, 11.6, "핵심은 '연결이 되는가'와 '대화할 만큼 빠른가'를 증거로 보이는 것이다")
set_notes(s, '가장 어렵다고 예상하는 문제는 두 가지입니다.\n'
          '첫째, 다른 네트워크 사이의 직접 연결입니다. 같은 와이파이에서는 이미 연결됐지만, 폰이 LTE이고 PC가 다른 와이파이에 있으면 둘 다 공유기 같은 NAT 뒤에 있습니다. '
          'STUN으로 바깥 주소를 알아내도, 통신사 NAT가 상대마다 다른 주소를 쓰거나 회사·학교 방화벽이 UDP를 막으면 직접 연결이 실패할 수 있습니다. '
          '그러면 TURN 서버가 영상을 대신 전달해야 하는데, 영상이 서버를 지나가니까 서버 대역폭과 비용이 생깁니다. '
          '실제로 이번 같은 와이파이 시험 19번 중 14번은 연결이 끝난 순간까지 STUN으로 얻는 공인 주소 후보가 없었습니다. 같은 와이파이에서는 내부 주소로 바로 붙으니 문제가 없었지만, 다른 네트워크에서는 이 후보가 꼭 있어야 합니다.\n'
          '둘째, 사람이 실제로 느끼는 지연을 재는 문제입니다. 브라우저가 알려 주는 왕복 지연은 네트워크 구간만 보여 줍니다. '
          '실제로는 카메라 촬영, 압축, 전송, 수신 대기, 화면 표시까지 다 더해진 시간이 전문가에게 보입니다. 그래서 카메라 렌즈에서 상대 화면까지의 지연을 밀리초 단위로 직접 재는 도구가 필요합니다.\n'
          '결국 이 과제의 핵심은 연결이 되는지, 되면 대화할 만큼 빠른지를 증거로 보여 주는 것이라고 생각합니다.')

# ---------- 5. 남은 계획 ----------
s = new_slide('[남은 계획] 4주 일정과 2주차 할 일')
table(s, 0.9, 1.3, 11.6, [1.2, 1.8, 5.8, 2.8], [
    ['주차', '기간', '주요 작업', '과목 제출물'],
    ['1주차', '11/09-11/15', '설계 문서 5종, 시그널링 서버, 1:1 연결, iPhone·iPad ↔ PC 같은 Wi-Fi 연결 시험 (완료)', 'System Design v1.0'],
    ['2주차', '11/16-11/22', '다른 네트워크 연결(LTE ↔ Wi-Fi), 영상·음성, 채팅·포인터, 품질 지표 수집, 지연 측정 도구', '연결 순서도, 실행 화면, 성공·실패 지점'],
    ['3주차', '11/23-11/29', '네트워크 조건별 품질 실험, 지연 실험, 핵심 지표 선정, 장애 대응, 실패 분석, 실제 서비스 확장 검토', '중간 점검, 통합 보고서'],
    ['4주차', '11/30-12/06', '최종 제출물 정리, 최종 발표 (일정 변동에 대비한 여유 주간)', '최종 발표'],
], size=14, row_h=0.62, align=['C', 'C', 'L', 'L'])
text(s, 0.9, 4.6, 11.6, 0.9, [
    [('2주차에 먼저 확인할 것: ', {'bold': True}), ('폰 LTE ↔ PC Wi-Fi 연결 시험 (성공 여부, 사용된 연결 경로, 실패하면 실패 단계), 연결 시점에 STUN 공인 주소 후보가 늦거나 없는 이유', {})],
], size=16)
conclusion(s, 0.9, 5.55, 11.6, '1주차 설계와 같은 Wi-Fi 연결은 끝났다. 2주차의 핵심은 다른 네트워크 연결 확인이다')
set_notes(s, '남은 계획입니다. 전체 4주로 잡았고, 마지막 주는 요구사항이 바뀔 수 있어서 최종 정리와 여유 주간으로 비워 두었습니다.\n'
          '실제 기기 연결은 2주차 계획이었는데 1주차에 먼저 끝냈습니다. 2주차에는 폰은 LTE, PC는 와이파이로 다른 네트워크 연결을 시험하고, STUN 공인 주소 후보가 왜 늦게 나오거나 없는지도 확인합니다. '
          '성공하면 어떤 경로로 연결됐는지, 실패하면 어느 단계에서 실패했는지를 기록하겠습니다. 같은 주에 영상과 음성, 채팅과 포인터, 품질 지표 수집, 지연 측정 도구를 만듭니다.\n'
          '3주차에는 네트워크 조건을 바꿔 가며 품질과 지연을 측정하고, 핵심 지표와 장애 대응, 실제 서비스로 확장할 때 필요한 것을 정리하겠습니다. 이상입니다.')

prs.save(OUT)
print('saved', OUT, len(prs.slides), 'slides')
