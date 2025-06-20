import { v2 as cloudinary } from 'cloudinary';

export const uploadToCloudinary = async (buffer) => {
  try {
    // Log configuration (hide secret)
    console.log('Cloudinary configuration:', {
      cloud_name: cloudinary.config().cloud_name,
      api_key: cloudinary.config().api_key,
      api_secret: cloudinary.config().api_secret ? '[REDACTED]' : undefined,
    });

    if (!cloudinary.config().cloud_name || !cloudinary.config().api_key || !cloudinary.config().api_secret) {
      throw new Error('Cloudinary configuration is incomplete. Check environment variables.');
    }

    return await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream({ folder: 'portfolios' }, (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error.message, error.stack);
          return reject(new Error(`Cloudinary upload failed: ${error.message}`));
        }
        console.log('Cloudinary upload successful:', result.secure_url);
        resolve(result.secure_url);
      }).end(buffer);
    });
  } catch (error) {
    throw new Error(`Cloudinary upload failed: ${error.message}`);
  }
};