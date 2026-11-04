import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';

function getAuth() {
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error('Google Drive credentials not configured');
  }

  // Handle various newlines formatting
  privateKey = privateKey.replace(/\\n/g, '\n');

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file'],
  });
}

// Cached folder ID to prevent repeated folder searches
let resolvedFolderId: string | null = null;

async function getOrCreateTargetFolder(drive: ReturnType<typeof google.drive>): Promise<string | undefined> {
  if (resolvedFolderId) return resolvedFolderId;

  const envFolder = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (envFolder && envFolder !== 'placeholder_folder_id' && envFolder.trim() !== '') {
    resolvedFolderId = envFolder.trim();
    return resolvedFolderId;
  }

  try {
    // Check if STLC_2026_Facturas_Y_Recibos folder exists
    const res = await drive.files.list({
      q: "name = 'STLC_2026_Facturas_Y_Recibos' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (res.data.files && res.data.files.length > 0) {
      resolvedFolderId = res.data.files[0].id!;
      return resolvedFolderId;
    }

    // Create the folder
    const createRes = await drive.files.create({
      requestBody: {
        name: 'STLC_2026_Facturas_Y_Recibos',
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });

    if (createRes.data.id) {
      resolvedFolderId = createRes.data.id;
      // Share folder publicly for read-only viewing
      await drive.permissions.create({
        fileId: resolvedFolderId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
      return resolvedFolderId;
    }
  } catch (err) {
    console.warn('Could not auto-create STLC_2026 folder, uploading to root:', err);
  }

  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const filename = formData.get('filename') as string;

    if (!file || !filename) {
      return NextResponse.json(
        { error: 'File and filename are required' },
        { status: 400 }
      );
    }

    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });

    const folderId = await getOrCreateTargetFolder(drive);

    const buffer = Buffer.from(await file.arrayBuffer());
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const fileMetadata: { name: string; mimeType: string; parents?: string[] } = {
      name: filename,
      mimeType: 'application/pdf',
    };

    if (folderId) {
      fileMetadata.parents = [folderId];
    }

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: 'application/pdf',
        body: stream,
      },
      fields: 'id, webViewLink, webContentLink',
    });

    // Make file accessible via link
    if (response.data.id) {
      await drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
    }

    return NextResponse.json({
      fileId: response.data.id,
      webViewLink: response.data.webViewLink,
      webContentLink: response.data.webContentLink,
    });
  } catch (error) {
    console.error('Google Drive upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload to Google Drive' },
      { status: 500 }
    );
  }
}
