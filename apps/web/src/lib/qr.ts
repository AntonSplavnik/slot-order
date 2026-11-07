// The QR code (docs/design.md §3 Pickup code, §11.2): it encodes the staff pickup URL. Not implemented yet.

/** `${origin}/staff/pickup?code=${code}`. */
export function pickupUrl(_origin: string, _code: string): string {
  throw new Error("not implemented");
}

/** The SVG markup of a QR code for `text` (`qrcode`, margin 1). */
export async function qrSvg(_text: string): Promise<string> {
  throw new Error("not implemented");
}
