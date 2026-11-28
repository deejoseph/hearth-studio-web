export const BOARD_STYLES = [
  { id: 'classic', label: '经典蓝' },
  { id: 'walnut', label: '胡桃木' },
  { id: 'green', label: '竞技绿' },
];

export const PIECE_STYLES = [
  { id: 'classic', label: '经典' },
  { id: 'forest', label: '森林' },
  { id: 'ocean', label: '海蓝' },
];

let activePieceStyle = 'classic';

export function normalizeBoardStyle(value) {
  return BOARD_STYLES.some((style) => style.id === value) ? value : 'classic';
}

export function normalizePieceStyle(value) {
  return PIECE_STYLES.some((style) => style.id === value) ? value : 'classic';
}

export function setPieceStyle(value) {
  activePieceStyle = normalizePieceStyle(value);
  return activePieceStyle;
}

export function currentPieceStyle() {
  return activePieceStyle;
}

export function pieceUrl(piece, style = currentPieceStyle()) {
  const fenPiece = piece.length === 2 ? piece : null;
  const symbol = fenPiece?.[1] ?? piece;
  const color = fenPiece ? fenPiece[0] : symbol.charCodeAt(0) < 97 ? 'w' : 'b';
  const folder = normalizePieceStyle(style) === 'classic' ? '' : `${normalizePieceStyle(style)}/`;
  return `${import.meta.env.BASE_URL}pieces/${folder}${color}${symbol.toUpperCase()}.svg`;
}
