// IKEA METOD planning modules, dimensions in millimetres.
// Footprints use the published system/product dimensions where stated.
// Always verify the selected article and assembly drawing before ordering/cutting.
// Official sources:
// Wall cabinets: https://www.ikea.com/no/no/p/metod-veggskap-hvit-30205528/
// Tall cabinets: https://www.ikea.com/no/no/p/metod-hoyskap-hvit-60212565/
// 88x88 corner base: https://www.ikea.com/no/no/p/metod-benkehjorneskap-hvit-40596748/
// 128x68 corner base: https://www.ikea.com/no/no/p/metod-benkehjorneskap-hvit-40596753/
const wallCabinets = [
  [200, 800], [300, 600], [300, 800],
  ...[400, 600, 800].flatMap(width => [400, 600, 800, 1000].map(height => [width, height])),
];

export const IKEA_METOD_SOURCES = {
  wallCabinet: "https://www.ikea.com/no/no/p/metod-veggskap-hvit-30205528/",
  baseCabinet: "https://www.ikea.com/no/no/p/metod-benkeskapstamme-hvit-50205626/",
  tallCabinet: "https://www.ikea.com/no/no/p/metod-hoyskap-hvit-60212565/",
  corner88: "https://www.ikea.com/no/no/p/metod-benkehjorneskap-hvit-40596748/",
  corner128: "https://www.ikea.com/no/no/p/metod-benkehjorneskap-hvit-40596753/",
};

const moduleRow = (id, type, label, width, depth, height, elevation = 0, source = null, notes = "") => ({
  id, type, label, width, depth, height, elevation, source, notes,
});

export const IKEA_METOD_MODULES = [
  // Floor cabinets: nominal 60 cm system depth; 80 cm frame height.
  ...[200, 300, 400, 600, 800, 1000, 1200].map(width =>
    moduleRow(`metod-base-${width}`, "base", `METOD benkeskap ${width / 10} × 60 × 80 cm`, width, 600, 800, 0, IKEA_METOD_SOURCES.baseCabinet, "Stammehøyde 80 cm; bein/sokkel og benkeplate kommer i tillegg.")
  ),
  ...[600, 800, 1000].map(width =>
    moduleRow(`metod-sink-${width}`, "sinkcab", `METOD vaskeskap ${width / 10} × 60 × 80 cm`, width, 600, 800, 0, IKEA_METOD_SOURCES.baseCabinet, "Kontroller vask og rørføring før bestilling.")
  ),
  // IKEA corner base units have different footprints; these are not generic 90x90 squares.
  moduleRow("metod-corner-88", "cornerbase", "METOD hjørnebenkeskap 88 × 88 cm", 875, 875, 800, 0, IKEA_METOD_SOURCES.corner88, "Yttermål ca. 87,5 × 87,5 cm; kontroller dør-/innredningsløsning."),
  moduleRow("metod-corner-128", "cornerbase", "METOD benkehjørneskap 128 × 68 cm", 1275, 675, 800, 0, IKEA_METOD_SOURCES.corner128, "Yttermål ca. 127,5 × 67,5 cm; plasser langs to vegger etter monteringsanvisningen."),
  // Wall cabinets: the plan footprint is width x 37 cm depth; height is the vertical cabinet height.
  ...wallCabinets.map(([width, height]) =>
    moduleRow(`metod-wall-${width}-${height}`, "wallcab", `METOD overskap ${width / 10} × 37 × ${height / 10} cm`, width, 370, height, 1400, IKEA_METOD_SOURCES.wallCabinet, "Høydeplassering 140 cm over gulv som startverdi; juster etter kjøkkenet.")
  ),
  ...[2000, 2200].map(height =>
    moduleRow(`metod-tall-600-${height}`, "tallcab", `METOD høyskap 60 × 60 × ${height / 10} cm`, 600, 600, height, 0, IKEA_METOD_SOURCES.tallCabinet, "Kontroller takhøyde, sokkel og valgt stamme før bestilling.")
  ),
];

export function validateIkeaMetodCatalog(modules = IKEA_METOD_MODULES) {
  if (!Array.isArray(modules) || modules.length < 10) return false;
  const ids = new Set();
  for (const module of modules) {
    if (!module.id || ids.has(module.id)) return false;
    ids.add(module.id);
    if (!["base", "sinkcab", "cornerbase", "wallcab", "tallcab"].includes(module.type)) return false;
    if (![module.width, module.depth, module.height].every(value => Number.isInteger(value) && value > 0)) return false;
  }
  const corner88 = modules.find(module => module.id === "metod-corner-88");
  const corner128 = modules.find(module => module.id === "metod-corner-128");
  return corner88?.width === 875 && corner88?.depth === 875 &&
    corner128?.width === 1275 && corner128?.depth === 675;
}
