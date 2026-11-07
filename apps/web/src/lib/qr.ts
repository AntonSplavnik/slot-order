import QRCode from "qrcode";

// The QR code (docs/design.md §3 Pickup code, §11.2): it encodes the staff pickup URL, so staff scan it with the
// phone's camera app.

/** `${origin}/staff/pickup?code=${code}`; the code as given (the API normalises it, §8.3). */
export function pickupUrl(origin: string, code: string): string {
  return `${origin}/staff/pickup?code=${code}`;
}

/** The SVG markup of a QR code for `text` (`qrcode`, margin 1). */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1 });
}
