import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { IncomingForm } from 'formidable';
import fs from 'fs/promises';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const supabase = createClient(supabaseUrl, supabaseKey);

function verifyToken(token) {
  try {
    return jwt.verify(token, jwtSecret);
  } catch (error) {
    return null;
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const form = new IncomingForm();

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const title = Array.isArray(fields.title) ? fields.title[0] : fields.title;
    const description = Array.isArray(fields.description) ? fields.description[0] : fields.description;
    const category = Array.isArray(fields.category) ? fields.category[0] : fields.category;
    const price = Array.isArray(fields.price) ? parseFloat(fields.price[0]) : parseFloat(fields.price || 0);

    const imageFile = Array.isArray(files.image) ? files.image[0] : files.image;

    if (!imageFile) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    // Read file content
    const fileContent = await fs.readFile(imageFile.filepath);
    const fileName = `${Date.now()}-${imageFile.originalFilename}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('artworks')
      .upload(`images/${fileName}`, fileContent, {
        contentType: imageFile.mimetype,
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('artworks')
      .getPublicUrl(`images/${fileName}`);

    // Insert artwork record
    const { data: artwork, error: dbError } = await supabase
      .from('artworks')
      .insert([
        {
          title,
          description,
          category,
          price,
          image_path: publicUrl,
        }
      ])
      .select()
      .single();

    if (dbError) throw dbError;

    return res.status(201).json({
      message: 'Artwork uploaded successfully',
      artwork
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
