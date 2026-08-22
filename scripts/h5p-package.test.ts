import { strToU8,zipSync } from "fflate";
import { describe,expect,it } from "vitest";
import { validateH5PPackage } from "./h5p-package";

const packageBytes=(content="{\"text\":\"safe\"}")=>zipSync({"h5p.json":strToU8(JSON.stringify({title:"Test",mainLibrary:"H5P.DragText",preloadedDependencies:[{machineName:"H5P.DragText",majorVersion:1,minorVersion:10}]})),"content/content.json":strToU8(content),"H5P.DragText-1.10/library.json":strToU8("{}")});
describe("controlled H5P package import",()=>{
  it("accepts a complete allow-listed package",()=>expect(validateH5PPackage(packageBytes()).definition.mainLibrary).toBe("H5P.DragText"));
  it("rejects zip-slip paths and executable content",()=>{
    expect(()=>validateH5PPackage(zipSync({"../evil.js":strToU8("x"),"h5p.json":strToU8("{}"),"content/content.json":strToU8("{}")}))).toThrow(/Unsafe H5P path/);
    expect(()=>validateH5PPackage(packageBytes('{"text":"<script>alert(1)</script>"}'))).toThrow(/executable HTML/);
  });
});
