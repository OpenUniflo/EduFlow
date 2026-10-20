import { expect,it } from "vitest";
import { writeLegacySettings } from "./legacySettings";
it("stores preferences outside retired workflow settings",()=>{const values=new Map<string,string>();writeLegacySettings({dailyReminder:true,compactMode:true,emailDigest:false},{getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);}});expect(values.has("knowledge-atlas.workflow-settings.v2")).toBe(false);expect(JSON.parse(values.get("knowledge-atlas.preferences.v1")!)).toMatchObject({compactMode:true,emailDigest:false});});
