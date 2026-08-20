import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { h5pMimeType,validateH5PPackage } from "./h5p-package";

const argument=(name:string)=>{const index=process.argv.indexOf(`--${name}`);return index>=0?process.argv[index+1]:undefined;};
const contentId=argument("content-id"),packagePath=argument("package"),url=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY;
if(!contentId||!packagePath||!url||!secret)throw new Error("--content-id, --package, SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const hosted=!/^https?:\/\/(127\.0\.0\.1|localhost)(?::|\/)/.test(url);if(hosted&&process.env.ALLOW_HOSTED_H5P!=="KnowledgeAtlas")throw new Error("Hosted H5P import requires ALLOW_HOSTED_H5P=KnowledgeAtlas");
const bytes=await readFile(packagePath),sha256=createHash("sha256").update(bytes).digest("hex"),validated=validateH5PPackage(bytes);const client=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:metadata,error:readError}=await client.from("h5p_contents").select("*").eq("id",contentId).maybeSingle();if(readError)throw readError;if(!metadata)throw new Error(`Unknown H5P content metadata: ${contentId}`);
if(metadata.package_sha256&&metadata.package_sha256!==sha256)throw new Error("This immutable H5P revision already has a different package checksum");
if(metadata.library_name!==validated.definition.mainLibrary||metadata.library_major!==validated.definition.majorVersion||metadata.library_minor!==validated.definition.minorVersion)throw new Error(`Package library ${validated.definition.mainLibrary} ${validated.definition.majorVersion}.${validated.definition.minorVersion} does not match metadata`);
const entries=Object.entries(validated.files);for(let offset=0;offset<entries.length;offset+=8){await Promise.all(entries.slice(offset,offset+8).map(async([name,file])=>{const {error}=await client.storage.from("micro-h5p").upload(`${metadata.storage_path}/${name}`,file,{contentType:h5pMimeType(name),cacheControl:"31536000",upsert:true});if(error)throw new Error(`H5P upload failed for ${name}: ${error.message}`);}));}
const {error:updateError}=await client.from("h5p_contents").update({status:"published",package_sha256:sha256,updated_at:new Date().toISOString()}).eq("id",contentId);if(updateError)throw updateError;
console.log(`Imported ${contentId} (${entries.length} files) into ${hosted?"Hosted KnowledgeAtlas":"Local Supabase"}.`);
