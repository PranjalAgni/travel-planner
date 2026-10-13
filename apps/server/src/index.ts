import { createApp } from "./app.js";
import { CachedSearchProvider, PhotonProvider } from "./places/photon.js";
import { EstimateProvider } from "./routing/estimate.js";
import { FallbackProvider, OsrmProvider } from "./routing/osrm.js";

const port = Number(process.env.PORT ?? 4000);
const osrmUrl = process.env.OSRM_URL ?? "https://router.project-osrm.org";
const photonUrl = process.env.PHOTON_URL ?? "https://photon.komoot.io";

const app = createApp({
  places: new CachedSearchProvider(new PhotonProvider(photonUrl, 8_000)),
  routing: new FallbackProvider(new OsrmProvider(osrmUrl, 15_000), new EstimateProvider(), (err) =>
    console.warn("OSRM unavailable, using distance estimates:", err instanceof Error ? err.message : err),
  ),
});

app.listen(port, () => {
  console.log(`travel-planner API listening on http://localhost:${port}`);
});
