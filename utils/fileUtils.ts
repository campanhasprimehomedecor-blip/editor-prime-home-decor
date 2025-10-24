/**
 * Converts a File object to a Base64 encoded string.
 * @param file The file to convert.
 * @returns A promise that resolves with the Base64 string (without the data URL prefix).
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Fetches an image from a URL and converts it to a Base64 string.
 * @param url The URL of the image to fetch and convert.
 * @returns A promise that resolves with an object containing the Base64 string and its MIME type.
 */
export const imageUrlToBase64 = async (url: string): Promise<{ base64: string; mimeType: string }> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from ${url}: ${response.statusText}`);
  }
  const blob = await response.blob();
  const mimeType = blob.type;
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ base64, mimeType });
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Crops an image based on the provided pixel values.
 * @param imageUrl The URL of the image to crop (can be a blob URL).
 * @param pixelCrop The crop parameters in pixels { x, y, width, height }.
 * @returns A promise that resolves with the cropped image as a Base64 string and its new dimensions.
 */
export const cropImage = (
  imageUrl: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<{ base64: string; dimensions: { width: number; height: number } }> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Allow loading of blob URLs
    image.crossOrigin = 'anonymous';
    
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return reject(new Error('Não foi possível obter o contexto do canvas.'));
      }

      const crop = {
        x: Math.round(pixelCrop.x),
        y: Math.round(pixelCrop.y),
        width: Math.round(pixelCrop.width),
        height: Math.round(pixelCrop.height),
      }

      canvas.width = crop.width;
      canvas.height = crop.height;

      // Draw the cropped portion of the image onto the canvas
      ctx.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height
      );

      // Get the cropped image data as a Base64 string
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];

      resolve({
        base64,
        dimensions: { width: crop.width, height: crop.height },
      });
    };
    
    image.onerror = (error) => {
      reject(new Error(`Falha ao carregar a imagem para o recorte: ${error}`));
    };

    image.src = imageUrl;
  });
};

/**
 * Pads a base64 image to a target aspect ratio, creating transparent areas.
 * This is used for "outpainting" tasks.
 * @param base64Image The base64 string of the source image (without data URL prefix).
 * @param targetAspectRatio The desired aspect ratio (width / height).
 * @returns A promise that resolves with the padded image as a Base64 string and its new dimensions.
 */
export const padImage = (
  base64Image: string,
  targetAspectRatio: number
): Promise<{ base64: string; dimensions: { width: number; height: number } }> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const currentAspectRatio = image.width / image.height;

      let canvasWidth: number, canvasHeight: number;
      let drawX = 0, drawY = 0;
      
      if (currentAspectRatio > targetAspectRatio) {
        // Image is wider than target, pad top/bottom to make it taller
        canvasWidth = image.width;
        canvasHeight = image.width / targetAspectRatio;
        drawY = (canvasHeight - image.height) / 2;
      } else {
        // Image is taller than target, pad left/right to make it wider
        canvasHeight = image.height;
        canvasWidth = image.height * targetAspectRatio;
        drawX = (canvasWidth - image.width) / 2;
      }
      
      canvasWidth = Math.round(canvasWidth);
      canvasHeight = Math.round(canvasHeight);
      drawX = Math.round(drawX);
      drawY = Math.round(drawY);

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Não foi possível obter o contexto do canvas.'));
      }
      
      // Draw the original image centered on the new transparent canvas
      ctx.drawImage(image, drawX, drawY, image.width, image.height);

      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];

      resolve({
        base64,
        dimensions: { width: canvas.width, height: canvas.height },
      });
    };
    image.onerror = (error) => reject(new Error(`Falha ao carregar a imagem para o preenchimento: ${error}`));
    // The input image from cropImage will be a PNG, so this is safe.
    image.src = `data:image/png;base64,${base64Image}`;
  });
};