# 품질 기록 CSV(전문가·현장 화면의 '품질 기록 저장') 한 개를 시간축 그래프 한 장으로 그린다 (#18)
# 실행: python3 tools/stats/plot_stats.py <stats.csv> [출력.png]
# 필요: matplotlib (tools/requirements.txt)
#
# 칸 4개: 받은 비트레이트와 초당 프레임 / 왕복 지연과 지터 / 손실률 / 지터 버퍼 지연
# 색은 docs/DESIGN.md 토큰만 쓴다: 먹(주 지표), 강철(보조 지표), 정지 빨강(연결이 끊긴 구간)

import csv
import sys
from pathlib import Path

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402

INK, STEEL, RULE, STOP = '#22272B', '#5F6B76', '#D5DADF', '#B42318'
from matplotlib import font_manager  # noqa: E402

# 한글 글꼴: 기준 글꼴(IBM Plex Sans KR)이 없으면 OS 기본 한글 글꼴을 쓴다
_installed = {f.name for f in font_manager.fontManager.ttflist}
KOREAN = [f for f in ('IBM Plex Sans KR', 'Apple SD Gothic Neo', 'AppleGothic', 'Malgun Gothic', 'NanumGothic') if f in _installed]
plt.rcParams.update({
    'font.family': KOREAN + ['sans-serif'],
    'font.size': 10,
    'axes.edgecolor': RULE,
    'axes.labelcolor': STEEL,
    'axes.spines.top': False,
    'axes.spines.right': False,
    'xtick.color': STEEL,
    'ytick.color': STEEL,
    'axes.grid': True,
    'grid.color': RULE,
    'grid.linewidth': 0.6,
    'axes.unicode_minus': False,
})


def load(path):
    with open(path, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def col(rows, key):
    out = []
    for r in rows:
        v = r.get(key, '')
        try:
            out.append(float(v))
        except ValueError:
            out.append(None)
    return out


def series(ax, t, ys, label, color, style='-'):
    pts = [(x, y) for x, y in zip(t, ys) if y is not None]
    if pts:
        ax.plot([p[0] for p in pts], [p[1] for p in pts], style, color=color, linewidth=1.6, label=label)
    return bool(pts)


def summary(ys):
    v = sorted(y for y in ys if y is not None)
    if not v:
        return '-'
    med = v[len(v) // 2]
    p95 = v[min(len(v) - 1, int(len(v) * 0.95))]
    return f'중앙값 {med:g}, p95 {p95:g}'


def plot(csv_path, out_path):
    rows = load(csv_path)
    if not rows:
        raise SystemExit('빈 CSV입니다')
    t = col(rows, 't_s')
    fig, axes = plt.subplots(4, 1, figsize=(10, 9), sharex=True, constrained_layout=True)

    # 연결이 connected가 아닌 구간을 빨강 띠로 표시
    bad = [x for x, r in zip(t, rows) if r.get('conn') not in ('connected', '')]
    for ax in axes:
        for x in bad:
            ax.axvspan(x - 0.5, x + 0.5, color=STOP, alpha=0.12, linewidth=0)

    ax = axes[0]
    series(ax, t, col(rows, 'in_kbps'), '받은 비트레이트 (kbps)', INK)
    ax.set_ylabel('kbps')
    ax2 = ax.twinx()
    ax2.grid(False)
    series(ax2, t, col(rows, 'in_fps'), '초당 프레임', STEEL, '--')
    ax2.set_ylabel('fps')
    ax2.spines['right'].set_visible(True)
    ax.set_title(f'받는 영상: {summary(col(rows, "in_kbps"))} kbps / fps {summary(col(rows, "in_fps"))}', loc='left', color=INK, fontsize=11)

    ax = axes[1]
    series(ax, t, col(rows, 'rtt_ms'), '왕복 지연 RTT (ms)', INK)
    series(ax, t, col(rows, 'in_jitter_ms'), '지터 (ms)', STEEL, '--')
    ax.set_ylabel('ms')
    ax.set_title(f'RTT {summary(col(rows, "rtt_ms"))} ms', loc='left', color=INK, fontsize=11)
    ax.legend(loc='upper right', frameon=False)

    ax = axes[2]
    series(ax, t, col(rows, 'in_loss_pct'), '손실률 (%)', INK)
    ax.set_ylabel('%')
    ax.set_ylim(bottom=0, top=max(1, max((y for y in col(rows, 'in_loss_pct') if y is not None), default=0) * 1.2))
    ax.set_title(f'영상 손실률 {summary(col(rows, "in_loss_pct"))} %', loc='left', color=INK, fontsize=11)

    ax = axes[3]
    series(ax, t, col(rows, 'in_jb_ms'), '지터 버퍼 지연 (ms)', INK)
    ax.set_ylabel('ms')
    ax.set_xlabel('기록 시작부터 초')
    ax.set_title(f'지터 버퍼 지연 {summary(col(rows, "in_jb_ms"))} ms', loc='left', color=INK, fontsize=11)

    fig.suptitle(Path(csv_path).name, x=0.01, ha='left', color=STEEL, fontsize=10)
    fig.savefig(out_path, dpi=150, facecolor='white')
    print(f'saved {out_path} ({len(rows)}줄)')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__ or '사용: python3 tools/stats/plot_stats.py <stats.csv> [출력.png]')
    src = sys.argv[1]
    plot(src, sys.argv[2] if len(sys.argv) > 2 else str(Path(src).with_suffix('.png')))
