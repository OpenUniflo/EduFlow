import { supabaseClient } from "@/shared/api/supabaseClient";
import { apiRequest } from "@/shared/api/apiClient";

type MaterialMetadata = {
  courseId: string;
  materialId: string;
  order: number;
  title: string;
  description?: string;
  pageCount?: number;
  duration?: string;
  segments?: Array<Record<string, unknown>>;
};

export async function getMaterialSourceUrl(courseId: string, materialId: string) {
  const query = new URLSearchParams({ courseId, materialId });
  const result = await apiRequest<{ sourceUrl: string; expiresIn: number }>(`/api/materials?${query}`);
  return result.sourceUrl;
}

export class ApiMaterialStorageService {
  async upload(file: File, metadata: MaterialMetadata) {
    const signed = await apiRequest<{ path: string; token: string }>("/api/materials", {
      method: "POST",
      body: JSON.stringify({ courseId: metadata.courseId, filename: file.name, contentType: file.type, size: file.size })
    });
    const upload = await supabaseClient.storage.from("course-materials").uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
    if (upload.error) throw upload.error;
    return apiRequest("/api/materials", {
      method: "PUT",
      body: JSON.stringify({ ...metadata, path: signed.path, contentType: file.type })
    });
  }
}
