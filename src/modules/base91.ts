/* basE91: binary data as printable text at about 123% of its size (base64 is 133%). The build packs the
   compressed libraries with `encode91` (esbuild.config.mjs keeps a twin of it); the plugin reads them with `decode91`. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

export function encode91(data: Uint8Array): string {
  let out = "", bits = 0, count = 0;
  for (const byte of data) {
    bits |= byte << count; count += 8;
    if (count > 13) {
      let value = bits & 8191;
      if (value > 88) { bits >>= 13; count -= 13; } else { value = bits & 16383; bits >>= 14; count -= 14; }
      out += ALPHABET[value % 91] + ALPHABET[(value / 91) | 0];
    }
  }
  if (count) { out += ALPHABET[bits % 91]; if (count > 7 || bits > 90) out += ALPHABET[(bits / 91) | 0]; }
  return out;
}

export function decode91(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  let length = 0, value = -1, bits = 0, count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i), digit = code < 128 ? LOOKUP[code] : -1;
    if (digit < 0) continue;
    if (value < 0) { value = digit; continue; }
    value += digit * 91; bits |= value << count; count += (value & 8191) > 88 ? 13 : 14;
    do { out[length++] = bits & 255; bits >>= 8; count -= 8; } while (count > 7);
    value = -1;
  }
  if (value > -1) out[length++] = (bits | (value << count)) & 255;
  return out.slice(0, length);
}
