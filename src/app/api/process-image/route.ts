import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 1. Initial pipeline: auto-rotate based on EXIF orientation
    let image = sharp(buffer).rotate();

    // 2. Intelligent Auto-crop: trim dark margins / table background borders if detected
    try {
      image = image.trim({ threshold: 30 });
    } catch {
      // If trim doesn't find borders to crop, proceed normally
    }

    // 3. CamScanner-style "Magic Color" Enhancement:
    // - Keeps original vivid colors (stamps, signatures, logos)
    // - Normalizes luminance range so paper background whitens
    // - Sharpens fine receipt typography (dot-matrix and thermal ink)
    // - Enhances text contrast without flattening to black & white
    const enhancedBuffer = await image
      .normalize() // Stretch contrast so paper background lifts
      .modulate({
        brightness: 1.06,  // Subtle brightness lift for crisp paper
        saturation: 1.15,  // Keep stamps, seals, and colors vibrant
      })
      .linear(1.12, -8)    // Increase text separation from paper
      .sharpen({
        sigma: 1.2,        // Target fine letter boundaries
        m1: 1.6,           // Flat areas
        m2: 0.8,           // Jagged text edges
      })
      .png({ quality: 95 })
      .toBuffer();

    // Get metadata of enhanced image
    const metadata = await sharp(enhancedBuffer).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 1100;

    // Scale to standard A4 (595 x 842 points) while preserving high resolution
    const a4Width = 595;
    const a4Height = 842;
    const scale = Math.min((a4Width * 2) / width, (a4Height * 2) / height, 1);
    const scaledWidth = Math.round(width * scale);
    const scaledHeight = Math.round(height * scale);

    const finalImage = await sharp(enhancedBuffer)
      .resize(scaledWidth, scaledHeight, { fit: 'inside' })
      .png({ quality: 95 })
      .toBuffer();

    const base64Image = finalImage.toString('base64');

    return NextResponse.json({
      processedImage: `data:image/png;base64,${base64Image}`,
      width: scaledWidth,
      height: scaledHeight,
      enhanced: true,
    });
  } catch (error) {
    console.error('Image processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process image' },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
