import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { AmenityFeature, RoadFeature } from "@/lib/geo";

export type LocalOsmIndex = {
  source: string;
  updatedAt: string;
  license: string;
  features: AmenityFeature[];
  roads: RoadFeature[];
};

let snapshot: LocalOsmIndex | null = null;

export function getLocalOsmIndex(): LocalOsmIndex {
  if (!snapshot) {
    const dataPath = join(process.cwd(), "public", "data", "albania-amenities.json.gz");
    snapshot = JSON.parse(gunzipSync(readFileSync(dataPath)).toString("utf8")) as LocalOsmIndex;
  }
  return snapshot;
}
