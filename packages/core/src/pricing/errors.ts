import type { CartErrorCode } from "../schemas/cart";

/** Why a cart cannot be priced (docs/design.md §7.2); `lineIndex` where one line is at fault. */
export class CartError extends Error {
  readonly code: CartErrorCode;
  readonly lineIndex: number | undefined;

  constructor(code: CartErrorCode, lineIndex?: number) {
    super(lineIndex === undefined ? code : `${code} (line ${lineIndex})`);
    this.name = "CartError";
    this.code = code;
    this.lineIndex = lineIndex;
  }
}
