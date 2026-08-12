import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServerSupabase, createUserSupabase, requireCapability } from "./_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "./_lib/http.js";
import { dataOrThrow } from "./_lib/query.js";

const MIME_TYPES = new Map([
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"]
]);
const MAX_FILE_SIZE = 50 * 1024 * 1024;

type MaterialSegmentInput = {
  id?: unknown;
  order?: unknown;
  page?: unknown;
  title?: unknown;
  section?: unknown;
  content?: unknown;
};

function safeFilename(value: string) {
  return value.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "material";
}

function validateSegments(materialType: string, pageCount: number | undefined, segments: MaterialSegmentInput[]) {
  const ids = new Set<string>();
  const orders = new Set<number>();
  const pages = new Set<number>();
  for (const segment of segments) {
    const id = typeof segment.id === "string" ? segment.id.trim() : "";
    const order = Number(segment.order);
    if (!id || !Number.isInteger(order) || order < 0) throw new ApiError(400, "invalid_segment", "Every segment requires a stable id and non-negative integer order");
    if (ids.has(id) || orders.has(order)) throw new ApiError(400, "duplicate_segment", "Segment ids and orders must be unique within a material");
    ids.add(id);
    orders.add(order);
    if (materialType !== "pdf") continue;
    const page = Number(segment.page);
    if (!Number.isInteger(page) || page < 1) throw new ApiError(400, "invalid_pdf_segment", "Every PDF segment requires a positive integer page");
    if (pages.has(page)) throw new ApiError(400, "duplicate_pdf_page", "PDF segment pages must be unique");
    pages.add(page);
  }
  if (materialType !== "pdf") return;
  if (segments.length !== pageCount || pages.size !== pageCount) throw new ApiError(400, "incomplete_pdf_segments", "PDF metadata must contain exactly one segment for every source page");
  for (let page = 1; page <= (pageCount ?? 0); page += 1) {
    if (!pages.has(page)) throw new ApiError(400, "incomplete_pdf_segments", "PDF segment pages must cover the complete 1..pageCount range");
  }
}

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  const { client, user } = await createUserSupabase(request);
  await requireCapability(user, "global-domain-admin");
  if (request.method === "POST") {
    const body = request.body as { courseId?: string; lessonId?: string; materialId?: string; filename?: string; contentType?: string; size?: number };
    if (!body?.courseId || !body.lessonId || !body.filename || !body.contentType || !Number.isFinite(body.size)) throw new ApiError(400, "invalid_upload", "Course, lesson, filename, content type, and size are required");
    if (!MIME_TYPES.has(body.contentType)) throw new ApiError(400, "unsupported_material", "Only PDF, PPTX, and DOCX uploads are supported");
    if ((body.size ?? 0) <= 0 || (body.size ?? 0) > MAX_FILE_SIZE) throw new ApiError(400, "invalid_file_size", "Material size must be between 1 byte and 50 MiB");
    const lesson = await client.from("curriculum_lessons").select("id").eq("course_id", body.courseId).eq("id", body.lessonId).maybeSingle();
    if (lesson.error || !lesson.data) throw new ApiError(404, "lesson_not_found", "Course lesson not found");
    let path = `shared/${body.courseId}/${randomUUID()}-${safeFilename(body.filename)}`;
    if (body.materialId) {
      const material = await client.from("materials").select("lesson_id, storage_path, material_type").eq("course_id", body.courseId).eq("id", body.materialId).maybeSingle();
      if (material.error || !material.data || material.data.lesson_id !== body.lessonId) throw new ApiError(404, "material_not_found", "Course material not found");
      if (!material.data.storage_path?.startsWith(`shared/${body.courseId}/`)) throw new ApiError(409, "invalid_material_path", "Seeded material has no shared storage path");
      if (material.data.material_type !== MIME_TYPES.get(body.contentType)) throw new ApiError(409, "material_type_mismatch", "Uploaded file type does not match material metadata");
      path = material.data.storage_path;
    }
    const signed = await createServerSupabase().storage.from("course-materials").createSignedUploadUrl(path, { upsert: true });
    if (signed.error || !signed.data) throw new Error(`Signed upload creation failed: ${signed.error?.message ?? "unknown"}`);
    json(response, 200, { bucket: "course-materials", path, token: signed.data.token, signedUrl: signed.data.signedUrl, materialType: MIME_TYPES.get(body.contentType) });
    return;
  }
  if (request.method === "PUT") {
    const body = request.body as {
      courseId?: string; lessonId?: string; materialId?: string; order?: number; title?: string; description?: string;
      path?: string; contentType?: string; pageCount?: number; duration?: string; segments?: MaterialSegmentInput[];
    };
    if (!body?.courseId || !body.lessonId || !body.materialId || !body.title || !body.path || !body.contentType || !Number.isInteger(body.order) || (body.order ?? -1) < 0) throw new ApiError(400, "invalid_material", "Complete material metadata is required");
    if (!body.path.startsWith(`shared/${body.courseId}/`)) throw new ApiError(403, "forbidden_storage_path", "Course material must use its course-scoped shared storage path");
    const materialType = MIME_TYPES.get(body.contentType);
    if (!materialType) throw new ApiError(400, "unsupported_material", "Unsupported material content type");
    if (materialType === "pdf" && (!Number.isInteger(body.pageCount) || (body.pageCount ?? 0) < 1)) throw new ApiError(400, "invalid_pdf", "PDF pageCount is required");
    const segments = body.segments ?? [];
    validateSegments(materialType, body.pageCount, segments);
    const server = createServerSupabase();
    const pathParts = body.path.split("/");
    const objectName = pathParts.pop();
    const objectResult = await server.storage.from("course-materials").list(pathParts.join("/"), { search: objectName, limit: 2 });
    if (objectResult.error || !objectName || !objectResult.data.some((object) => object.name === objectName)) throw new ApiError(409, "upload_incomplete", "The uploaded object could not be verified");
    const materialResult = await server.from("materials").insert({
      course_id: body.courseId, id: body.materialId, lesson_id: body.lessonId, display_order: body.order,
      title: body.title, description: body.description ?? null, material_type: materialType, storage_path: body.path,
      page_count: body.pageCount ?? null, duration: body.duration ?? null, uploaded_by: user.id
    });
    dataOrThrow(materialResult.data, materialResult.error, "Material metadata insert");
    if (segments.length) {
      const segmentResult = await server.from("material_segments").insert(segments.map((segment) => ({
        course_id: body.courseId, material_id: body.materialId, id: String(segment.id), display_order: Number(segment.order),
        page: segment.page == null ? null : Number(segment.page), title: segment.title ?? null, section: segment.section ?? null, content: segment.content ?? null
      })));
      dataOrThrow(segmentResult.data, segmentResult.error, "MaterialSegment insert");
    }
    json(response, 201, { material: { id: body.materialId, courseId: body.courseId, lessonId: body.lessonId, storagePath: body.path, type: materialType } });
    return;
  }
  return methodNotAllowed(response, ["POST", "PUT"]);
});
