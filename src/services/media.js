import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config.js';

let configured = false;
function cld() {
  if (!configured) {
    const { cloudName, apiKey, apiSecret } = config.cloudinary;
    if (!cloudName || !apiKey || !apiSecret) throw new Error('Cloudinary is not configured (CLOUD_NAME, C_API_KEY, C_API_SECRET)');
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    configured = true;
  }
  return cloudinary;
}

// Per-kind rules: Cloudinary resource type, storage folder, accepted formats and size limit.
export const MEDIA_KINDS = {
  video: { folder: 'savemaharashtra/videos', formats: ['mp4', 'webm', 'mov'], maxBytes: () => config.maxVideoBytes },
  image: { folder: 'savemaharashtra/images', formats: ['jpg', 'jpeg', 'png', 'webp', 'heic'], maxBytes: () => config.maxImageBytes },
};

// Signed direct upload: the browser sends the file straight to Cloudinary; our server only signs.
export function signUpload(kind, publicId) {
  const timestamp = Math.round(Date.now() / 1000);
  const params = { public_id: publicId, timestamp, allowed_formats: MEDIA_KINDS[kind].formats.join(',') };
  const signature = cld().utils.api_sign_request(params, config.cloudinary.apiSecret);
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/${kind}/upload`,
    fields: { ...params, api_key: config.cloudinary.apiKey, signature },
  };
}

export async function getResource(kind, publicId) {
  try {
    return await cld().api.resource(publicId, { resource_type: kind });
  } catch (err) {
    if (err?.error?.http_code === 404 || err?.http_code === 404) return null;
    throw err;
  }
}

export async function deleteMedia(kind, publicId) {
  await cld().uploader.destroy(publicId, { resource_type: kind, invalidate: true });
}

export function mediaUrls(kind, publicId) {
  const c = cld();
  if (kind === 'image') {
    return {
      src: c.url(publicId, { resource_type: 'image', format: 'jpg', transformation: [{ width: 1600, crop: 'limit', quality: 'auto' }] }),
    };
  }
  return {
    src: c.url(publicId, { resource_type: 'video', format: 'mp4', transformation: [{ quality: 'auto' }] }),
    poster: c.url(publicId, { resource_type: 'video', format: 'jpg', transformation: [{ start_offset: '1' }] }),
  };
}
