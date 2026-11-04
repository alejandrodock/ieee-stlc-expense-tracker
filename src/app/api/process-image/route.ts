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

    // Process image: enhance contrast, convert to grayscale, sharpen (CamScanner-like)
    const processedBuffer = await sharp(buffer)
      .grayscale()
      .normalize() // auto contrast
      .sharpen({ sigma: 1.5, m1: 1.0, m2: 0.5 })
      .modulate({ brightness: 1.1 })
      .threshold(140) // clean black & white
      .png({ quality: 95 })
      .toBuffer();

    // Get image metadata for PDF dimensions
    const metadata = await sharp(processedBuffer).metadata();
    const width = metadata.width || 595;
    const height = metadata.height || 842;

    // Scale to fit A4 (595 x 842 points)
    const a4Width = 595;
    const a4Height = 842;
    const scale = Math.min(a4Width / width, a4Height / height, 1);
    const scaledWidth = Math.round(width * scale);
    const scaledHeight = Math.round(height * scale);

    // Resize to fit A4
    const finalImage = await sharp(processedBuffer)
      .resize(scaledWidth, scaledHeight, { fit: 'inside' })
      .png()
      .toBuffer();

    const base64Image = finalImage.toString('base64');

    return NextResponse.json({
      processedImage: `data:image/png;base64,${base64Image}`,
      width: scaledWidth,
      height: scaledHeight,
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
