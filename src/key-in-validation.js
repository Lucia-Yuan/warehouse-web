const CODE_LOCATION = /^[A-Z0-9]+$/;
const CHINESE_LOCATION = /^(?=.*\p{Script=Han})[\p{Script=Han}0-9\s·（）()、，。-]+$/u;
const PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"]);

export function validLocation(value) {
  const location = String(value ?? "").trim();
  return location.length > 0 && location.length <= 100 &&
    (CODE_LOCATION.test(location) || CHINESE_LOCATION.test(location));
}

export function validQuantity(value) {
  return /^[1-9]\d*$/.test(String(value ?? "")) && Number.isSafeInteger(Number(value));
}

export function validPhoto(file) {
  return Boolean(file && PHOTO_MIME.has(file.type) && file.size > 0 && file.size <= 20 * 1024 * 1024);
}
