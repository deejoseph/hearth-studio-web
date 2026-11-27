/**
 * Annotation overlay: lets users draw on the board (square highlights, arrows)
 * for teaching/review purposes. Annotations are keyed by FEN so they follow the
 * position, not the ply index.
 */

const COLORS = {
  yellow: '#ffeb3b',
  green: '#4caf50',
  red: '#f44336',
  blue: '#2196f3',
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const STORAGE_KEY = 'chess-annotations';

export class AnnotationOverlay {
  /**
   * @param {HTMLElement} boardFrame - the .board-frame container
   * @param {{ getFen(): string, getOrientation(): string }} ctx - provides current position and orientation
   */
  constructor(boardFrame, ctx) {
    this.boardFrame = boardFrame;
    this.ctx = ctx;
    this.svg = this._createSvg();
    this.annotations = this._load(); // fen -> [{type, square, from, to, color}]
    // 默认不选任何画笔：棋盘上第一下应该是走棋，不是往格子上涂颜色。开着画笔时
    // 点击格子会被这里吃掉，走子的那次 pointerdown 就白点了。
    this.activeTool = null; // 'square' | 'arrow' | 'erase' | null
    this.activeColor = COLORS.yellow;
    this._arrowStart = null;
    this._tempArrow = null;
    this.onEdit = null; // set to a function to mirror drawings to a classroom
    this._install();
  }

  _createSvg() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.className.baseVal = 'annotation-overlay';
    svg.setAttribute('viewBox', '0 0 8 8');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.pointerEvents = 'none';
    return svg;
  }

  _install() {
    this.boardFrame.style.position = 'relative';
    this.boardFrame.appendChild(this.svg);
    this._ensureDefs(); // Create marker defs immediately
    this.boardFrame.addEventListener('click', (e) => this._onClick(e));
    this.boardFrame.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    window.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerup', (e) => this._onPointerUp(e));
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Map();
      const obj = JSON.parse(raw);
      return new Map(Object.entries(obj));
    } catch {
      return new Map();
    }
  }

  _save() {
    try {
      const obj = Object.fromEntries(this.annotations);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // localStorage full or disabled — annotations still work in-memory
    }
  }

  /** End every local edit here: persist, repaint, and tell the room about it. */
  _commit() {
    this._save();
    this._render();
    this.onEdit?.();
  }

  /**
   * Write a drawing someone else sent, keyed to a position this board already
   * knows. Silent by design: the remote end already has it, so this must not
   * fire onEdit or two devices would broadcast the same strokes back and forth.
   */
  applyRemote(fen, list) {
    const clean = (Array.isArray(list) ? list : []).filter(
      (a) => a && (a.type === 'square' || a.type === 'arrow'),
    );
    if (clean.length) this.annotations.set(fen, clean);
    else this.annotations.delete(fen);
    this._save();
    this._render();
  }

  _squareFromPoint(x, y) {
    const rect = this.boardFrame.getBoundingClientRect();
    let c = Math.floor(((x - rect.left) / rect.width) * 8);
    let r = Math.floor(((y - rect.top) / rect.height) * 8);
    if (c < 0 || c > 7 || r < 0 || r > 7) return null;
    if (this.ctx.getOrientation() === 'b') {
      c = 7 - c;
      r = 7 - r;
    }
    const file = String.fromCharCode(97 + c);
    const rank = 8 - r;
    return file + rank;
  }

  _squareToSvgCoords(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = 8 - parseInt(square[1], 10);
    let x = file;
    let y = rank;
    if (this.ctx.getOrientation() === 'b') {
      x = 7 - x;
      y = 7 - y;
    }
    return { x, y };
  }

  _onClick(e) {
    if (this.activeTool === 'arrow' || !this.activeTool) return;
    const square = e.target.closest('.square')?.dataset.square || this._squareFromPoint(e.clientX, e.clientY);
    if (!square) return;
    if (this.activeTool === 'square') {
      this._toggleSquare(square);
    } else if (this.activeTool === 'erase') {
      this._eraseAt(square, e.clientX, e.clientY);
    }
  }

  _onPointerDown(e) {
    if (this.activeTool !== 'arrow') return;
    // Try to find square from DOM first, then fall back to coordinate calculation
    const squareEl = e.target.closest('.square');
    let square = squareEl ? squareEl.dataset.square : null;
    if (!square) {
      square = this._squareFromPoint(e.clientX, e.clientY);
    }
    if (!square) return;
    this._arrowStart = square;
    this._tempArrow = this._createArrowElement(square, square, this.activeColor, true);
    this.svg.appendChild(this._tempArrow);
    e.preventDefault();
    e.stopPropagation();
  }

  _onPointerMove(e) {
    if (!this._arrowStart || !this._tempArrow) return;
    const square = this._squareFromPoint(e.clientX, e.clientY);
    if (square && square !== this._arrowStart) {
      this._updateArrow(this._tempArrow.querySelector('line'), this._arrowStart, square);
    }
  }

  _onPointerUp(e) {
    if (!this._arrowStart) return;
    // Try to find square from DOM first, then fall back to coordinate calculation
    const squareEl = e.target.closest('.square');
    let square = squareEl ? squareEl.dataset.square : null;
    if (!square) {
      square = this._squareFromPoint(e.clientX, e.clientY);
    }
    if (this._tempArrow) this._tempArrow.remove();
    if (square && square !== this._arrowStart) {
      this._addArrow(this._arrowStart, square);
    }
    this._arrowStart = null;
    this._tempArrow = null;
  }

  _toggleSquare(square) {
    const fen = this.ctx.getFen();
    const list = this.annotations.get(fen) || [];
    const idx = list.findIndex((a) => a.type === 'square' && a.square === square);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push({ type: 'square', square, color: this.activeColor });
    }
    if (list.length === 0) this.annotations.delete(fen);
    else this.annotations.set(fen, list);
    this._commit();
  }

  _addArrow(from, to) {
    const fen = this.ctx.getFen();
    const list = this.annotations.get(fen) || [];
    list.push({ type: 'arrow', from, to, color: this.activeColor });
    this.annotations.set(fen, list);
    this._commit();
  }

  _eraseAt(square, clientX, clientY) {
    const fen = this.ctx.getFen();
    const list = this.annotations.get(fen) || [];
    const filtered = list.filter((a) => {
      if (a.type === 'square') return a.square !== square;
      if (a.type === 'arrow') {
        // Check if click is near the arrow line (not just endpoints)
        if (clientX !== undefined && clientY !== undefined) {
          const { x: x1, y: y1 } = this._squareToSvgCoords(a.from);
          const { x: x2, y: y2 } = this._squareToSvgCoords(a.to);
          const rect = this.boardFrame.getBoundingClientRect();
          const clickX = ((clientX - rect.left) / rect.width) * 8;
          const clickY = ((clientY - rect.top) / rect.height) * 8;
          // Distance from point to line segment
          const dist = this._pointToLineDistance(clickX, clickY, x1 + 0.5, y1 + 0.5, x2 + 0.5, y2 + 0.5);
          return dist > 0.3; // Keep if click is far from line
        }
        // Fallback: check endpoints
        return a.from !== square && a.to !== square;
      }
      return true;
    });
    if (filtered.length === 0) this.annotations.delete(fen);
    else this.annotations.set(fen, filtered);
    this._commit();
  }

  _pointToLineDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  }

  clearAll() {
    const fen = this.ctx.getFen();
    this.annotations.delete(fen);
    this._commit();
  }

  setTool(tool) {
    this.activeTool = tool; // 'square' | 'arrow' | 'erase' | null
    this._tempArrow?.remove();
    this._arrowStart = null;
    this._tempArrow = null;
  }

  setColor(color) {
    this.activeColor = COLORS[color] || color;
  }

  _render() {
    while (this.svg.firstChild) this.svg.firstChild.remove();
    this._ensureDefs();
    const fen = this.ctx.getFen();
    const list = this.annotations.get(fen) || [];
    for (const ann of list) {
      if (ann.type === 'square') {
        this.svg.appendChild(this._createSquareElement(ann.square, ann.color));
      } else if (ann.type === 'arrow') {
        this.svg.appendChild(this._createArrowElement(ann.from, ann.to, ann.color, false));
      }
    }
  }

  _createSquareElement(square, color) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    const { x, y } = this._squareToSvgCoords(square);
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', 1);
    rect.setAttribute('height', 1);
    rect.setAttribute('fill', color);
    rect.setAttribute('opacity', '0.5');
    rect.style.pointerEvents = 'none'; // Let clicks pass through to the square
    return rect;
  }

  _createArrowElement(from, to, color, isTemp) {
    const g = document.createElementNS(SVG_NS, 'g');
    const line = document.createElementNS(SVG_NS, 'line');
    this._updateArrow(line, from, to);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', isTemp ? '0.1' : '0.15');
    line.style.pointerEvents = 'auto';
    line.style.cursor = isTemp ? 'crosshair' : 'pointer';
    g.appendChild(line);

    // Add arrowhead as a triangle path
    const arrowhead = this._createArrowhead(from, to, color, isTemp);
    if (arrowhead) g.appendChild(arrowhead);

    return g;
  }

  _createArrowhead(from, to, color, isTemp) {
    const { x: x1, y: y1 } = this._squareToSvgCoords(from);
    const { x: x2, y: y2 } = this._squareToSvgCoords(to);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return null;

    // Arrow tip position (slightly before the end to account for line shortening)
    const tipX = x1 + 0.5 + dx;
    const tipY = y1 + 0.5 + dy;

    // Arrow size
    const size = isTemp ? 0.25 : 0.3;

    // Calculate arrowhead triangle points
    const angle = Math.atan2(dy, dx);
    const leftX = tipX - size * Math.cos(angle - Math.PI / 6);
    const leftY = tipY - size * Math.sin(angle - Math.PI / 6);
    const rightX = tipX - size * Math.cos(angle + Math.PI / 6);
    const rightY = tipY - size * Math.sin(angle + Math.PI / 6);

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M ${tipX} ${tipY} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`);
    path.setAttribute('fill', color);
    path.style.pointerEvents = 'auto';
    path.style.cursor = isTemp ? 'crosshair' : 'pointer';
    return path;
  }

  _updateArrow(line, from, to) {
    const { x: x1, y: y1 } = this._squareToSvgCoords(from);
    const { x: x2, y: y2 } = this._squareToSvgCoords(to);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const shortenBy = 0.12;
    const ratio = Math.max(0, (len - shortenBy) / len);
    line.setAttribute('x1', x1 + 0.5);
    line.setAttribute('y1', y1 + 0.5);
    line.setAttribute('x2', x1 + 0.5 + dx * ratio);
    line.setAttribute('y2', y1 + 0.5 + dy * ratio);
  }

  _ensureDefs() {
    if (this.svg.querySelector('defs')) return;
    const defs = document.createElementNS(SVG_NS, 'defs');
    for (const [name, color] of Object.entries(COLORS)) {
      const marker = document.createElementNS(SVG_NS, 'marker');
      marker.setAttribute('id', `arrowhead-${color.replace('#', '')}`);
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '8');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '0.6');
      marker.setAttribute('markerHeight', '0.6');
      marker.setAttribute('orient', 'auto');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M 0 2 L 8 5 L 0 8 z');
      path.setAttribute('fill', color);
      marker.appendChild(path);
      defs.appendChild(marker);
    }
    this.svg.insertBefore(defs, this.svg.firstChild);
  }
}
