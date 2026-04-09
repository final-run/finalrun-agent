// ANSI color helpers — avoids ESM-only chalk dependency in CommonJS CLI package.

const ESC = '\x1b[';
const RESET = `${ESC}0m`;

export const colors = {
  green: (s: string) => `${ESC}32m${s}${RESET}`,
  red: (s: string) => `${ESC}31m${s}${RESET}`,
  yellow: (s: string) => `${ESC}33m${s}${RESET}`,
  cyan: (s: string) => `${ESC}36m${s}${RESET}`,
  magenta: (s: string) => `${ESC}35m${s}${RESET}`,
  blue: (s: string) => `${ESC}34m${s}${RESET}`,
  dim: (s: string) => `${ESC}2m${s}${RESET}`,
  bold: (s: string) => `${ESC}1m${s}${RESET}`,
  white: (s: string) => s,
};
