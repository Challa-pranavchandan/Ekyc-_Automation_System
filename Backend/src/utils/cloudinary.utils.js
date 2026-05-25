import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

// Configure once on import
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

// ─── Upload file to Cloudinary ────────────────────────────────────────────────
export const uploadOnCloudinary = async (filePath, folder = 'ekyc') => {
  try {
    console.log('Attempting Cloudinary upload for:', filePath);
    console.log('Config:', {
      cloud_name: cloudinary.config().cloud_name,
      api_key: cloudinary.config().api_key,
    });
    if (!filePath) return null;

    const response = await cloudinary.uploader.upload(filePath, {
      resource_type: 'auto',
      folder,
      // Secure URL always
      secure: true,
    });

    // Delete local temp file after successful upload
    fs.unlinkSync(filePath);

    return {
      url: response.secure_url,
      publicId: response.public_id,
      format: response.format,
      bytes: response.bytes,
      width: response.width,
      height: response.height,
    };
  } catch (error) {
    // Delete local temp file even on failure
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    console.error('Cloudinary upload error:', error.message);
    return null;
  }
};

// ─── Delete file from Cloudinary ─────────────────────────────────────────────
export const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    if (!publicId) return null;
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    return result; // { result: 'ok' } on success
  } catch (error) {
    console.error('Cloudinary delete error:', error.message);
    return null;
  }
};
