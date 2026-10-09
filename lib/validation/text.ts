/** Strip control characters, collapse whitespace and cap length. User text is data, never instructions. */
export function cleanText(s: string, max = 80): string {
  return s
     
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
