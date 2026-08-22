import { unzipSync } from "fflate";

const MAX_PACKAGE=50*1024*1024,MAX_EXTRACTED=120*1024*1024,MAX_FILES=1800;
const allowedMainLibraries=new Set(["H5P.DragQuestion","H5P.Blanks","H5P.DragText","H5P.QuestionSet"]);
const dangerousExtensions=/\.(?:php\d*|phar|exe|com|bat|cmd|sh|ps1|wasm)$/i;
const decoder=new TextDecoder();
export type ValidatedH5PPackage={files:Record<string,Uint8Array>;definition:{title:string;mainLibrary:string;majorVersion:number;minorVersion:number}};

export function validateH5PPackage(bytes:Uint8Array):ValidatedH5PPackage {
  if(bytes.byteLength<4||bytes.byteLength>MAX_PACKAGE||bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error("H5P package must be a ZIP smaller than 50 MiB");
  const files=unzipSync(bytes);const names=Object.keys(files).filter((name)=>!name.endsWith("/"));
  if(!names.length||names.length>MAX_FILES)throw new Error("H5P package file count is invalid");
  let total=0;for(const name of names){total+=files[name].byteLength;if(name.startsWith("/")||name.includes("\\")||name.split("/").includes("..")||name.includes("\0")||dangerousExtensions.test(name))throw new Error(`Unsafe H5P path: ${name}`);}
  if(total>MAX_EXTRACTED)throw new Error("Extracted H5P package is too large");
  if(!files["h5p.json"]||!files["content/content.json"])throw new Error("H5P package is missing h5p.json or content/content.json");
  const h5p=JSON.parse(decoder.decode(files["h5p.json"])) as Record<string,unknown>;const contentText=decoder.decode(files["content/content.json"]);
  if(typeof h5p.title!=="string"||typeof h5p.mainLibrary!=="string"||!allowedMainLibraries.has(h5p.mainLibrary))throw new Error("Unsupported H5P main library");
  if(/<script\b|javascript\s*:|\bon(?:load|error|click)\s*=/i.test(contentText)||/"(?:path|src)"\s*:\s*"https?:/i.test(contentText))throw new Error("H5P content contains executable HTML or an external asset URL");
  const dependencies=Array.isArray(h5p.preloadedDependencies)?h5p.preloadedDependencies as Array<Record<string,unknown>>:[];const main=dependencies.find((item)=>item.machineName===h5p.mainLibrary);
  const majorVersion=Number(main?.majorVersion),minorVersion=Number(main?.minorVersion);if(!main||!Number.isInteger(majorVersion)||!Number.isInteger(minorVersion)||majorVersion<0||minorVersion<0)throw new Error("H5P main library dependency is incomplete");
  const versioned=`${h5p.mainLibrary}-${majorVersion}.${minorVersion}`;if(!files[`${versioned}/library.json`]&&!files[`${h5p.mainLibrary}/library.json`])throw new Error("H5P main library files are missing");
  for(const name of names.filter((name)=>name.toLocaleLowerCase().endsWith(".svg"))){const svg=decoder.decode(files[name]);if(/<script\b|javascript\s*:|\bon(?:load|error|click)\s*=/i.test(svg))throw new Error(`Unsafe SVG in H5P package: ${name}`);}
  return {files:Object.fromEntries(names.map((name)=>[name,files[name]])),definition:{title:h5p.title,mainLibrary:h5p.mainLibrary,majorVersion,minorVersion}};
}

export function h5pMimeType(path:string) { const extension=path.split(".").pop()?.toLocaleLowerCase();return ({json:"application/json",js:"text/javascript",css:"text/css",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",svg:"image/svg+xml",woff:"font/woff",woff2:"font/woff2",ttf:"font/ttf",mp3:"audio/mpeg",mp4:"video/mp4",webm:"video/webm"} as Record<string,string>)[extension??""]??"application/octet-stream"; }
