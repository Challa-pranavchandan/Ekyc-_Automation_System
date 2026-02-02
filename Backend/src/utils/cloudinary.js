import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

async function configureCloudinary() {

    // Configuration
    cloudinary.config({ 
        cloud_name: process.env.CLOUDINARY_NAME, 
        api_key: process.env.CLOUDINARY_KEY, 
        api_secret: process.env.CLOUDINARY_SECRET 
    });
}
  const uploadOnCloudinary = async (filePath, folder) => {
    try {
         if (!filePath) return null
         cloudinary.uploader.upload(filePath, {
            resource_type: "auto"
        })
        console.log("File uploaded to Cloudinary successfully",
        response.url);
        return response;
    } catch (error) {
         fs.unlinkSync(filePath);// Delete the local file in case of error
         console.error("Error uploading file to Cloudinary:", error);
         return null;
    }
    }
