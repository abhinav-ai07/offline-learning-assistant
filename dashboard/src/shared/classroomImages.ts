export async function classroomImages(images: File[]): Promise<Blob[]> {
  if (images.length > 6) throw new Error("Choose up to six classroom images.");
  const encoded: Blob[] = [];
  for (const file of images) {
    if (file.size > 20 * 1024 * 1024) throw new Error("Choose images under 20 MB each.");
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare classroom image");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not encode classroom image");
      encoded.push(blob);
    } finally {
      bitmap.close();
    }
  }
  return encoded;
}

export function imageBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read classroom image"));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(blob);
  });
}
